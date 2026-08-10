/**
 * sessionHelpers —— AuditSession 版本操作封装
 *
 * 提供三类工具：
 *  1. 读取当前版本（getCurrentVersion）
 *  2. 版本增删改（addNewVersion / updateVersion / switchVersion）
 *  3. 约束判断（canAddVersion）
 */

import type {
  AuditSession,
  AuditVersion,
  Board,
} from '@/components/workbench/types';
import { MAX_VERSIONS } from '@/components/workbench/types';
import type { ImageFile } from '@/types';
import type { PlatformConsistencyIssue } from '@/lib/crossPlatform';

/** 取出当前展示的版本；index 越界时兜底到 0 */
export function getCurrentVersion(session: AuditSession): AuditVersion {
  const idx = Math.max(0, Math.min(session.currentVersionIndex, session.versions.length - 1));
  return session.versions[idx];
}

/** 取上一个版本（用于对比 / 关联）；不存在返回 null */
export function getPrevVersion(session: AuditSession): AuditVersion | null {
  const idx = session.currentVersionIndex;
  if (idx <= 0) return null;
  return session.versions[idx - 1] ?? null;
}

/** 能否再新增一个版本 */
export function canAddVersion(session: AuditSession): boolean {
  return session.versions.length < MAX_VERSIONS;
}

/**
 * 基于当前会话的最后一版，创建一个新版本
 *  - 继承：designRefImage / iosRegions / androidRegions（深拷贝）
 *  - 重置：iosImage / androidImage（可只上传一端）
 *  - 清空：crossPlatformResult / issueLinks（新版本重新走查）
 *
 * 返回新的 session（未修改原对象）；若已达上限或两端都空则返回 null
 */
export function addNewVersion(
  session: AuditSession,
  newAssets: {
    iosImage: ImageFile | null;
    androidImage: ImageFile | null;
    designRefImage?: ImageFile | null;
    label?: string;
  },
): AuditSession | null {
  if (!canAddVersion(session)) return null;
  // 至少一端；两端都空拒绝新建
  if (!newAssets.iosImage && !newAssets.androidImage) return null;

  const last = session.versions[session.versions.length - 1];
  const newVersion: AuditVersion = {
    v: last.v + 1,
    label: newAssets.label,
    createdAt: Date.now(),
    iosImage: newAssets.iosImage ?? null,
    androidImage: newAssets.androidImage ?? null,
    // 设计稿：优先用新传的；否则继承上一版
    designRefImage: newAssets.designRefImage ?? last.designRefImage ?? null,
    // 标注区域：深拷贝上一版
    iosRegions: (last.iosRegions ?? []).map((r) => ({ ...r, rect: { ...r.rect } })),
    androidRegions: (last.androidRegions ?? []).map((r) => ({ ...r, rect: { ...r.rect } })),
    crossPlatformResult: null,
    issueLinks: {},
  };

  const newVersions = [...session.versions, newVersion];
  return {
    ...session,
    versions: newVersions,
    currentVersionIndex: newVersions.length - 1, // 自动切到新版本
  };
}

/** 更新当前版本的部分字段（不可变更新） */
export function updateCurrentVersion(
  session: AuditSession,
  patch: Partial<AuditVersion>,
): AuditSession {
  const idx = session.currentVersionIndex;
  const newVersions = session.versions.map((v, i) => (i === idx ? { ...v, ...patch } : v));
  return { ...session, versions: newVersions };
}

/**
 * P4.3：批量走查追加新版本
 *  - 输入：session（batch 类型）+ 新一批 boards（buildBoardsFromGroups 生成，name 已作 key）
 *  - 匹配：按 board.name 与上一版对齐
 *    · 上版有、新版有 → 继承 id / designImage / designFigma / firstAppearedVersion；替换截图；清 result
 *    · 上版有、新版无 → 保留在新版本中但打 removedInVersion，冻结旧结果
 *    · 上版无、新版有 → firstAppearedVersion = newV
 *  - 达到 MAX_VERSIONS 上限 → 返回 null
 *
 * 注意：本 helper P4 阶段暂无 UI 触发；先建能力，为后续"batch 新版本上传"入口铺路
 */
export function addBatchVersion(
  session: AuditSession,
  newBoards: Board[],
  label?: string,
): AuditSession | null {
  if (!canAddVersion(session)) return null;
  if (!isBatchSession(session)) return null;
  if (newBoards.length === 0) return null;

  const last = session.versions[session.versions.length - 1];
  const prevBoards = last.boards ?? [];
  const newV = last.v + 1;

  // 建立新版索引：name → newBoard
  const newByName = new Map<string, Board>();
  for (const nb of newBoards) newByName.set(nb.name, nb);

  const mergedBoards: Board[] = [];

  // 1) 遍历上一版：命中的替换/未命中的标 removed
  for (const pb of prevBoards) {
    const match = newByName.get(pb.name);
    if (match) {
      // 命中：继承 id + designImage/designFigma + firstAppearedVersion；采用新截图；清 result
      mergedBoards.push({
        ...match,
        id: pb.id, // 保 id 稳定，跨版本对比可对齐
        designImage: match.designImage ?? pb.designImage,
        designFigma: match.designFigma ?? pb.designFigma,
        firstAppearedVersion: pb.firstAppearedVersion,
        removedInVersion: undefined, // 之前被移除又回来，清除标记
        crossPlatformResult: null,
      });
      newByName.delete(pb.name);
    } else {
      // 未命中：保留在新版本，但标 removedInVersion；冻结旧结果
      mergedBoards.push({
        ...pb,
        removedInVersion: pb.removedInVersion ?? newV,
      });
    }
  }

  // 2) newByName 剩下的 = 新增 board（上一版没有）
  for (const nb of newByName.values()) {
    mergedBoards.push({
      ...nb,
      firstAppearedVersion: newV,
    });
  }

  const newVersion: AuditVersion = {
    v: newV,
    label,
    createdAt: Date.now(),
    boards: mergedBoards,
    activeBoardId: mergedBoards[0]?.id,
    // 单画板字段保持 null（batch 不用）
    iosImage: null,
    androidImage: null,
    designRefImage: null,
    iosRegions: [],
    androidRegions: [],
    crossPlatformResult: null,
    issueLinks: {},
  };

  const newVersions = [...session.versions, newVersion];
  return {
    ...session,
    versions: newVersions,
    currentVersionIndex: newVersions.length - 1,
  };
}

/**
 * 向当前版本的 issues 中添加一条手工标注的问题
 * 返回修改后的 session（未修改原对象）
 */
export function addManualIssue(
  session: AuditSession,
  issue: PlatformConsistencyIssue,
): AuditSession {
  const idx = session.currentVersionIndex;
  const newVersions = session.versions.map((v, i) => {
    if (i !== idx) return v;
    const result = v.crossPlatformResult;
    if (!result) return v;
    return {
      ...v,
      crossPlatformResult: {
        ...result,
        issues: [...result.issues, issue],
      },
    };
  });
  return { ...session, versions: newVersions };
}

/** 切换当前版本 */
export function switchVersion(session: AuditSession, index: number): AuditSession {
  if (index < 0 || index >= session.versions.length) return session;
  return { ...session, currentVersionIndex: index };
}

/** 格式化版本标签：v1 / v2 · 当前 */
export function formatVersionLabel(session: AuditSession, index: number): string {
  const v = session.versions[index];
  if (!v) return '';
  const isCurrent = index === session.currentVersionIndex;
  return `v${v.v}${isCurrent ? ' · 当前' : ''}`;
}

// ─── 版本对比：问题状态推导 ────────────────────────────────────────────────

/**
 * 单条问题相对上一版的状态：
 *  - 'new'     ：本版新增（未关联到上一版任何问题）
 *  - 'persist' ：本版仍存在（已手动关联到上一版某条）
 *  - 'first'   ：这是 v1，没有"新增/存续"的语义
 */
export type IssueVersionStatus = 'new' | 'persist' | 'first';

/** 判断当前版本某条 issue 相对上一版的状态 */
export function getIssueVersionStatus(
  session: AuditSession,
  issueId: string,
): IssueVersionStatus {
  const prev = getPrevVersion(session);
  if (!prev) return 'first';
  const cur = getCurrentVersion(session);
  const links = cur.issueLinks ?? {};
  return links[issueId] ? 'persist' : 'new';
}

/**
 * 取当前版本关联到某条上一版问题的 issue id；未关联返回 null
 * 用于问题卡片右上角显示"🔗 关联到 v(n-1) #3 xxx"
 */
export function getLinkedPrevIssueId(
  session: AuditSession,
  currentIssueId: string,
): string | null {
  const cur = getCurrentVersion(session);
  return cur.issueLinks?.[currentIssueId] ?? null;
}

/**
 * 取上一版中所有"未被当前版本关联"的问题（即"已修复"候选）
 * P2 用来在右栏加【已修复】分组
 */
export function getFixedPrevIssues(session: AuditSession) {
  const prev = getPrevVersion(session);
  if (!prev || !prev.crossPlatformResult) return [];
  const cur = getCurrentVersion(session);
  const linkedIds = new Set(Object.values(cur.issueLinks ?? {}));
  return prev.crossPlatformResult.issues.filter((i) => !linkedIds.has(i.id));
}

/**
 * 取上一版中所有"可被当前版本某条问题关联"的问题
 * 排除已经被别的问题关联走的（一对一约束）；但 excludeCurrentIssueId 关联的允许显示（表示"当前关联"）
 */
export function getLinkableCandidates(
  session: AuditSession,
  excludeCurrentIssueId: string,
) {
  const prev = getPrevVersion(session);
  if (!prev || !prev.crossPlatformResult) return [];
  const cur = getCurrentVersion(session);
  const links = cur.issueLinks ?? {};
  const takenPrevIds = new Set(
    Object.entries(links)
      .filter(([curId]) => curId !== excludeCurrentIssueId)
      .map(([, prevId]) => prevId),
  );
  return prev.crossPlatformResult.issues.filter((i) => !takenPrevIds.has(i.id));
}

/**
 * 在当前版本上设置/清除一条关联；若目标 prevIssueId 已被别的关联占用，则自动解除那个（一对一约束）
 * 传 prevIssueId=null 表示清除本条的关联
 */
export function setIssueLink(
  session: AuditSession,
  currentIssueId: string,
  prevIssueId: string | null,
): AuditSession {
  const cur = getCurrentVersion(session);
  const links = { ...(cur.issueLinks ?? {}) };

  if (prevIssueId === null) {
    delete links[currentIssueId];
  } else {
    // 自动解除：把已经关联到 prevIssueId 的其他 currentId 移除
    for (const [k, v] of Object.entries(links)) {
      if (v === prevIssueId && k !== currentIssueId) {
        delete links[k];
      }
    }
    links[currentIssueId] = prevIssueId;
  }

  return updateCurrentVersion(session, { issueLinks: links });
}

// ─── 版本对比（P3） ────────────────────────────────────────────────────────

/**
 * 两个版本之间的差异快照
 *
 *  - added   ：toVersion 中新增（未关联到 fromVersion 任何条目）
 *  - persist ：toVersion 中关联到 fromVersion 某条 → 存续
 *  - fixed   ：fromVersion 中未被 toVersion 任何条目关联 → 视为已修复
 *
 * 一对一约束确保 persist 每个元素都能查到 from/to 双方
 */
export interface VersionDiff {
  fromIndex: number;
  toIndex: number;
  fromVersion: AuditVersion;
  toVersion: AuditVersion;
  added: PlatformConsistencyIssue[];
  fixed: PlatformConsistencyIssue[];
  persist: Array<{ from: PlatformConsistencyIssue; to: PlatformConsistencyIssue }>;
  /** 评分差值（正 = 提升，负 = 下降）；无结果时为 null */
  scoreDelta: {
    overall: number | null;
    consistency: number | null;
  };
}

/**
 * 计算 fromIndex → toIndex 的差异
 *
 * 关键约束：diff 只在**相邻两版**（|to - from| === 1 且 to = from + 1）时有效，
 * 因为 issueLinks 只保存"当前版指向上一版"的映射；跨版对比会 fallback 到"仅按 id 完全匹配"。
 */
export function computeVersionDiff(
  session: AuditSession,
  fromIndex: number,
  toIndex: number,
): VersionDiff | null {
  const fromVersion = session.versions[fromIndex];
  const toVersion = session.versions[toIndex];
  if (!fromVersion || !toVersion) return null;

  const fromIssues = fromVersion.crossPlatformResult?.issues ?? [];
  const toIssues = toVersion.crossPlatformResult?.issues ?? [];
  const links = toVersion.issueLinks ?? {};

  // 只有 to = from + 1 时 links 才代表 to→from；其他情况 links 无效，走空
  const linksValid = toIndex === fromIndex + 1;
  const effectiveLinks = linksValid ? links : ({} as Record<string, string>);

  const fromById = new Map(fromIssues.map((i) => [i.id, i]));
  const linkedPrevIds = new Set(Object.values(effectiveLinks));

  const persist: Array<{ from: PlatformConsistencyIssue; to: PlatformConsistencyIssue }> = [];
  const added: PlatformConsistencyIssue[] = [];

  for (const toIssue of toIssues) {
    const prevId = effectiveLinks[toIssue.id];
    if (prevId && fromById.has(prevId)) {
      persist.push({ from: fromById.get(prevId)!, to: toIssue });
    } else {
      added.push(toIssue);
    }
  }

  const fixed = fromIssues.filter((i) => !linkedPrevIds.has(i.id));

  const fromRes = fromVersion.crossPlatformResult;
  const toRes = toVersion.crossPlatformResult;
  const scoreDelta = {
    overall:
      fromRes && toRes ? toRes.overallScore - fromRes.overallScore : null,
    consistency:
      fromRes && toRes
        ? toRes.platformConsistencyScore - fromRes.platformConsistencyScore
        : null,
  };

  return {
    fromIndex,
    toIndex,
    fromVersion,
    toVersion,
    added,
    fixed,
    persist,
    scoreDelta,
  };
}

// ─── 相似度推荐（P3：一键自动匹配） ────────────────────────────────────────

/** Jaccard 相似度：0..1，越大越像 */
function tokenSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]+/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 1),
    );
  const A = tokenize(a);
  const B = tokenize(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * 综合相似度：title(0.5) + description(0.3) + regionName(0.15) + severity(0.05)
 * 返回 0..1
 */
export function issueSimilarity(
  a: PlatformConsistencyIssue,
  b: PlatformConsistencyIssue,
): number {
  const titleSim = tokenSimilarity(a.title, b.title);
  const descSim = tokenSimilarity(a.description ?? '', b.description ?? '');
  const regionSim =
    a.regionName && b.regionName && a.regionName === b.regionName ? 1 : 0;
  const sevSim = a.severity === b.severity ? 1 : 0;
  return titleSim * 0.5 + descSim * 0.3 + regionSim * 0.15 + sevSim * 0.05;
}

/**
 * 一键为当前版本所有"未关联"的问题，基于相似度贪心地匹配上一版剩余问题
 *
 *  - 只匹配 sim >= threshold 的对
 *  - 一对一：一个 prevIssue 只能被匹配一次
 *  - 已有的手动关联保持不动
 *
 * 返回新的 session 与"新增匹配数"
 */
export function autoLinkIssuesBySimilarity(
  session: AuditSession,
  threshold = 0.35,
): { session: AuditSession; matched: number } {
  const prev = getPrevVersion(session);
  if (!prev || !prev.crossPlatformResult) return { session, matched: 0 };
  const cur = getCurrentVersion(session);
  if (!cur.crossPlatformResult) return { session, matched: 0 };

  const existingLinks = { ...(cur.issueLinks ?? {}) };
  const usedPrevIds = new Set(Object.values(existingLinks));

  // 未关联的当前版问题
  const unlinkedCurrent = cur.crossPlatformResult.issues.filter(
    (i) => !existingLinks[i.id],
  );
  // 未被占用的上一版问题
  const availablePrev = prev.crossPlatformResult.issues.filter(
    (i) => !usedPrevIds.has(i.id),
  );

  // 计算所有 pair 的相似度并按降序贪心
  const pairs: Array<{ curId: string; prevId: string; sim: number }> = [];
  for (const c of unlinkedCurrent) {
    for (const p of availablePrev) {
      const sim = issueSimilarity(c, p);
      if (sim >= threshold) pairs.push({ curId: c.id, prevId: p.id, sim });
    }
  }
  pairs.sort((a, b) => b.sim - a.sim);

  const takenCur = new Set<string>();
  const takenPrev = new Set<string>();
  let matched = 0;
  for (const { curId, prevId } of pairs) {
    if (takenCur.has(curId) || takenPrev.has(prevId)) continue;
    existingLinks[curId] = prevId;
    takenCur.add(curId);
    takenPrev.add(prevId);
    matched++;
  }

  if (matched === 0) return { session, matched: 0 };

  return {
    session: updateCurrentVersion(session, { issueLinks: existingLinks }),
    matched,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 批量走查（P1）：Board 读取 helper
// ═══════════════════════════════════════════════════════════════════════════

/** 是否为批量走查（多画板） */
export function isBatchSession(session: AuditSession | null | undefined): boolean {
  return session?.type === 'batch';
}

/**
 * 取当前版本下当前激活的 board
 * 若是单画板走查（未设置 boards）或 boards 为空，返回 null
 */
export function getActiveBoard(session: AuditSession | null | undefined): Board | null {
  if (!session) return null;
  const version = getCurrentVersion(session);
  if (!version.boards || version.boards.length === 0) return null;
  const activeId = version.activeBoardId ?? version.boards[0].id;
  return version.boards.find((b) => b.id === activeId) ?? version.boards[0] ?? null;
}

/** 按 id 从当前版本中取 board */
export function getBoardById(
  session: AuditSession | null | undefined,
  boardId: string,
): Board | null {
  if (!session) return null;
  const version = getCurrentVersion(session);
  return version.boards?.find((b) => b.id === boardId) ?? null;
}

/**
 * 统一读取接口 —— 屏蔽"单画板 vs 批量"的差异，供渲染层使用
 * 单画板走查：从 version 顶层字段读
 * 批量走查：从 activeBoard 读
 *
 * 未来所有 `getCurrentVersion(s).iosImage` 类调用可以迁移到这里；
 * P1 仅提供该接口，不强制替换现有代码
 */
export interface ActiveContext {
  iosImage: ImageFile | null;
  androidImage: ImageFile | null;
  /** 手动上传的设计稿图片；Figma 拉取的设计稿见 designFigma */
  designImage: ImageFile | null;
  /** batch 会话中该画板关联的 Figma frame（若有） */
  designFigma: import('@/components/workbench/types').FigmaFrameRef | null;
  crossPlatformResult: ReturnType<typeof getCurrentVersion>['crossPlatformResult'];
  /** iOS 标注区域（batch 场景暂返回空数组，P4 引入 board.regions 时再补） */
  iosRegions: import('@/lib/crossPlatform').DrawingRegion[];
  androidRegions: import('@/lib/crossPlatform').DrawingRegion[];
  /** 若是 batch 会话返回 activeBoard，否则 null */
  activeBoard: Board | null;
  /** 若是 batch 会话返回全部 boards，否则 null */
  boards: Board[] | null;
}

export function getActiveContext(session: AuditSession | null | undefined): ActiveContext | null {
  if (!session) return null;
  const version = getCurrentVersion(session);

  if (isBatchSession(session) && version.boards && version.boards.length > 0) {
    const board = getActiveBoard(session);
    return {
      iosImage: board?.iosImage ?? null,
      androidImage: board?.androidImage ?? null,
      designImage: board?.designImage ?? null,
      designFigma: board?.designFigma ?? null,
      crossPlatformResult: board?.crossPlatformResult ?? null,
      iosRegions: [],
      androidRegions: [],
      activeBoard: board,
      boards: version.boards,
    };
  }

  // 单画板走查：从 version 顶层字段读
  return {
    iosImage: version.iosImage ?? null,
    androidImage: version.androidImage ?? null,
    designImage: version.designRefImage ?? null,
    designFigma: null,
    crossPlatformResult: version.crossPlatformResult ?? null,
    iosRegions: version.iosRegions ?? [],
    androidRegions: version.androidRegions ?? [],
    activeBoard: null,
    boards: null,
  };
}

// ─── Board 变更（P2/P3 会用到；P1 先定义好 API） ──────────────────────────

/** 切换当前版本的激活 board */
export function setActiveBoardId(session: AuditSession, boardId: string): AuditSession {
  return updateCurrentVersion(session, { activeBoardId: boardId });
}

/** 更新当前版本某个 board 的部分字段（不可变更新） */
export function updateBoardInCurrentVersion(
  session: AuditSession,
  boardId: string,
  patch: Partial<Board>,
): AuditSession {
  const idx = session.currentVersionIndex;
  const newVersions = session.versions.map((v, i) => {
    if (i !== idx || !v.boards) return v;
    const newBoards = v.boards.map((b) => (b.id === boardId ? { ...b, ...patch } : b));
    return { ...v, boards: newBoards };
  });
  return { ...session, versions: newVersions };
}

/** 向当前版本追加一个 board（activeBoardId 自动切到新增的） */
export function addBoardToCurrentVersion(session: AuditSession, board: Board): AuditSession {
  const idx = session.currentVersionIndex;
  const newVersions = session.versions.map((v, i) => {
    if (i !== idx) return v;
    const boards = v.boards ?? [];
    return { ...v, boards: [...boards, board], activeBoardId: board.id };
  });
  return { ...session, versions: newVersions };
}

/** 从当前版本移除一个 board；若移除的是激活 board，自动切到第一个剩余 board */
export function removeBoardFromCurrentVersion(session: AuditSession, boardId: string): AuditSession {
  const idx = session.currentVersionIndex;
  const newVersions = session.versions.map((v, i) => {
    if (i !== idx || !v.boards) return v;
    const newBoards = v.boards.filter((b) => b.id !== boardId);
    const newActiveId =
      v.activeBoardId === boardId ? newBoards[0]?.id : v.activeBoardId;
    return { ...v, boards: newBoards, activeBoardId: newActiveId };
  });
  return { ...session, versions: newVersions };
}

