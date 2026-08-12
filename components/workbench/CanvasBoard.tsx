'use client';

/**
 * CanvasBoard —— 类 Figma 画板容器
 *
 * 功能：
 *   - 背景棋盘网格（20px 一格淡线，100px 一格深线）
 *   - 顶部横标尺 + 左侧竖标尺（显示百分比刻度）
 *   - 右下角浮层：缩放百分比 + −/+ 按钮 + 适应窗口按钮
 *   - 滚轮缩放：按住 Cmd/Ctrl + 滚轮缩放（普通滚轮保留滚动）
 *   - 鼠标坐标浮标：跟随光标显示当前 (x%, y%)
 *   - 子内容通过 CSS transform: scale() 缩放
 *
 * 抖动修复：
 *   - 鼠标坐标 setState 用 rAF 节流 + 0.5% 精度收敛（Fix-1）
 *   - ResizeObserver 回调做相等阈值检查，避免浮点微抖（Fix-2）
 *   - 浮标 / 缩放控件放到外层不带 overflow 的 wrapper 上，不受滚动影响（Fix-3）
 *   - 内容宽度用「自然宽 × scale」px 值驱动，杜绝 100% + 滚动条循环（Fix-4）
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  forwardRef,
  type ReactNode,
} from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { CanvasScaleContext } from './CanvasScaleContext';

/** focusOnRect 参数：归一化坐标 + 目标图片 pane 的 DOM 元素 */
export interface CanvasBoardHandle {
  /**
   * 把指定 pane 内的归一化区域平滑滚动到画板中心，scale 保持不变
   * @param paneEl  带 data-image-pane 属性的 DOM 元素
   * @param rect    归一化坐标 {x, y, width, height}，相对于 paneEl 内图片
   */
  focusOnRect(
    paneEl: HTMLElement,
    rect: { x: number; y: number; width: number; height: number },
  ): void;
}

interface CanvasBoardProps {
  children: ReactNode;
  /** 画板高度模式：
   *   - number: 固定 px 高度
   *   - 'fill': 拿满 flex 父容器剩余高度（父级需为 flex 容器且 CanvasBoard 有 flex:1 或类似类）
   * 默认 520px 固定高度 */
  height?: number | 'fill';
  /** 兼容旧字段：作为最小高度（当 height='fill' 时生效） */
  minHeight?: number;
  /** 初始缩放比例，默认 1 */
  initialScale?: number;
  /** 缩放范围 */
  minScale?: number;
  maxScale?: number;
  /** 顶部悬浮工具栏 slot（右侧对齐，位于横标尺之上） */
  toolbar?: ReactNode;
}

const RULER = 24;              // 标尺厚度
const CONTROLS_PAD = 12;
const SCALE_STEP = 0.1;
const FINE_STEP = 0.02;
const SIZE_EPS = 1.5;          // ResizeObserver 相等阈值（px）；>1 吃掉滚动条边缘误差

export default forwardRef<CanvasBoardHandle, CanvasBoardProps>(function CanvasBoard({
  children,
  height,
  minHeight = 520,
  initialScale = 1,
  minScale = 0.25,
  maxScale = 3,
  toolbar,
}, ref) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentInnerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(initialScale);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [scrollSize, setScrollSize] = useState({ w: 0, h: 0 });
  const [contentNatural, setContentNatural] = useState({ w: 0, h: 0 });

  // ── 缩放 spring（Apple §4）:
  //   scale (state) = 逻辑目标值，用于 UI/Context/计算
  //   springScale (motion value) = 呈现值，跟 UI transform 走 spring，可中断
  //   两者通过 useEffect 同步：目标改 → spring 弹过去
  const rawScale = useMotionValue(initialScale);
  const springScale = useSpring(rawScale, {
    // Apple UI 默认：damping 1.0（无 overshoot）
    // 缩放场景 duration 稍短，因为 layout 尺寸走逻辑值、transform 走 spring value，
    // 两者略有时差；短 duration 让人眼几乎察觉不到（<250ms）
    bounce: 0,
    duration: 0.25,
  });
  useEffect(() => {
    rawScale.set(scale);
  }, [scale, rawScale]);
  // 缩放变换字符串，喂给 motion.div
  const springTransform = useTransform(springScale, (s) => `scale(${s})`);

  // ── 自动适应：内容或容器尺寸变化时，只要用户没手动调过缩放，就重算 fit ──
  const userAdjustedRef = useRef(false);
  const markUserAdjusted = useCallback(() => {
    userAdjustedRef.current = true;
  }, []);

  // rAF 节流：cursor 更新
  const cursorRafRef = useRef<number | null>(null);
  const pendingCursorRef = useRef<{ x: number; y: number } | null>(null);
  const lastCursorRef = useRef<{ x: number; y: number } | null>(null);

  // ── Fix-2: ResizeObserver 带阈值；用 clientWidth/clientHeight 避免滚动条宽度抖动 ──
  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const ob = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setScrollSize((prev) => {
        if (Math.abs(prev.w - w) < SIZE_EPS && Math.abs(prev.h - h) < SIZE_EPS) return prev;
        return { w, h };
      });
    });
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!contentInnerRef.current) return;
    const el = contentInnerRef.current;
    const ob = new ResizeObserver((entries) => {
      for (const e of entries) {
        // 注意：内容自然尺寸不受 scale 影响（因为 scale 用 transform，不改 layout size）
        setContentNatural((prev) => {
          if (
            Math.abs(prev.w - e.contentRect.width) < SIZE_EPS &&
            Math.abs(prev.h - e.contentRect.height) < SIZE_EPS
          ) {
            return prev;
          }
          return { w: e.contentRect.width, h: e.contentRect.height };
        });
      }
    });
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  // ── 缩放范围钳制 ──
  const clampScale = useCallback(
    (v: number) => Math.min(maxScale, Math.max(minScale, v)),
    [minScale, maxScale],
  );

  // ── 命令式 API：focusOnRect ──────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    focusOnRect(paneEl, rect) {
      const scrollEl = scrollRef.current;
      const contentEl = contentInnerRef.current;
      if (!scrollEl || !contentEl) return;

      // scale 保持不变
      const curScale = scale;

      // 计算 pane 相对于 contentInner（未缩放坐标系）的位置
      const paneRect = paneEl.getBoundingClientRect();
      const contentRect = contentEl.getBoundingClientRect();

      const paneLeft = (paneRect.left - contentRect.left) / curScale;
      const paneTop  = (paneRect.top  - contentRect.top)  / curScale;
      const paneW    = paneRect.width  / curScale;
      const paneH    = paneRect.height / curScale;

      // 问题区域中心点（未缩放坐标系）
      const regionCX = paneLeft + (rect.x + rect.width  / 2) * paneW;
      const regionCY = paneTop  + (rect.y + rect.height / 2) * paneH;

      // 缩放后该点的像素位置
      const scaledCX = regionCX * curScale;
      const scaledCY = regionCY * curScale;

      // 画板可视区中心（除去 RULER padding）
      const viewCX = (scrollEl.clientWidth  - RULER) / 2;
      const viewCY = (scrollEl.clientHeight - RULER) / 2;

      scrollEl.scrollTo({
        left: scaledCX + RULER + 12 - viewCX,
        top:  scaledCY + RULER + 12 - viewCY,
        behavior: 'smooth',
      });
    },
  }), [scale]);

  // ── 滚轮缩放（只响应 Cmd/Ctrl）
  //   spring 版：直接 setScale 到目标值，spring 自动从当前呈现值起步弹过去
  //   到达边界时不再是硬停：spring 会因超出 clamp 而自然弹回（无需 rubber-band 视觉突破，
  //   Apple §9 里 rubber-band 是给拖拽用的；缩放到边界只需 spring 稍带减速感即可）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const step = FINE_STEP;
      const dir = e.deltaY > 0 ? -1 : 1;
      markUserAdjusted();
      setScale((s) => clampScale(+(s + dir * step).toFixed(3)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [clampScale, markUserAdjusted]);

  // ── Fix-1: 鼠标坐标用 rAF 节流 + 0.5% 精度收敛 ──
  const flushCursor = useCallback(() => {
    cursorRafRef.current = null;
    const next = pendingCursorRef.current;
    if (!next) {
      if (lastCursorRef.current !== null) {
        lastCursorRef.current = null;
        setCursor(null);
      }
      return;
    }
    const last = lastCursorRef.current;
    // 相等阈值：0.5% 内不重渲染
    if (last && Math.abs(last.x - next.x) < 0.5 && Math.abs(last.y - next.y) < 0.5) {
      return;
    }
    lastCursorRef.current = next;
    setCursor(next);
  }, []);

  // Pointer Events（Apple §2）：统一鼠标 / 触控 / 触摸屏轨迹
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!contentInnerRef.current) return;
      const rect = contentInnerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      if (x < 0 || x > 100 || y < 0 || y > 100) {
        pendingCursorRef.current = null;
      } else {
        pendingCursorRef.current = { x, y };
      }
      if (cursorRafRef.current == null) {
        cursorRafRef.current = requestAnimationFrame(flushCursor);
      }
    },
    [flushCursor],
  );

  const onPointerLeave = useCallback(() => {
    pendingCursorRef.current = null;
    if (cursorRafRef.current == null) {
      cursorRafRef.current = requestAnimationFrame(flushCursor);
    }
  }, [flushCursor]);

  useEffect(() => {
    return () => {
      if (cursorRafRef.current != null) cancelAnimationFrame(cursorRafRef.current);
    };
  }, []);

  // ── 适应窗口：把内容缩放到刚好塞进画板可视区（除去标尺） ──
  const fitToWindow = useCallback(() => {
    const availW = scrollSize.w - RULER - 24;
    const availH = scrollSize.h - RULER - 24;
    if (availW <= 0 || availH <= 0 || contentNatural.w === 0 || contentNatural.h === 0) {
      return;
    }
    const s = Math.min(availW / contentNatural.w, availH / contentNatural.h, maxScale);
    setScale(clampScale(+s.toFixed(3)));
  }, [scrollSize, contentNatural, maxScale, clampScale]);

  // ── 自动首次适应：内容和容器都测好后，只 fit 一次；之后 scrollSize 变化不再触发
  //    （避免滚动条 hover 出现/消失导致的宽度抖动引发 auto-fit 循环）──
  useEffect(() => {
    if (userAdjustedRef.current) return;
    if (contentNatural.w === 0 || contentNatural.h === 0) return;
    if (scrollSize.w === 0 || scrollSize.h === 0) return;
    const availW = scrollSize.w - RULER - 24;
    const availH = scrollSize.h - RULER - 24;
    if (availW <= 0 || availH <= 0) return;
    const s = Math.min(availW / contentNatural.w, availH / contentNatural.h, maxScale, 1);
    setScale(clampScale(+s.toFixed(3)));
    // 首次 fit 完成后，标记为"已调整"，避免后续 scrollSize/contentNatural 波动再触发
    // 用户仍可点右下角"适应"按钮手动重 fit
    userAdjustedRef.current = true;
  }, [contentNatural, scrollSize, maxScale, clampScale]);

  // 手动适应按钮：算入用户操作
  const handleFitClick = useCallback(() => {
    markUserAdjusted();
    fitToWindow();
  }, [markUserAdjusted, fitToWindow]);

  // ── 标尺刻度：已弃用（改用 RulerOverlay 像素尺） ──
  // const marks = useMemo(() => [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], []);

  // ── Fix-4: 缩放后的内容盒子 px 尺寸 ──
  const scaledW = contentNatural.w * scale;
  const scaledH = contentNatural.h * scale;

  return (
    // Fix-3: 外层 wrapper，不带 overflow（rounded/border），用来悬浮控件和浮标
    // 高度模式：'fill' → 拿满 flex 父容器（flex-1 min-h-0）；否则用固定 px height
    <div
      ref={wrapperRef}
      className={
        height === 'fill'
          ? 'relative w-full flex-1 min-h-0 rounded-2xl border border-slate-200/60 bg-white overflow-hidden shadow-chip'
          : 'relative w-full rounded-2xl border border-slate-200/60 bg-white overflow-hidden shadow-chip'
      }
      style={
        height === 'fill'
          ? { minHeight }
          : { height: typeof height === 'number' ? height : minHeight }
      }
    >
      {/* 内层：真正的滚动容器 + 网格背景 + 内容 */}
      <div
        ref={scrollRef}
        className="w-full h-full overflow-auto"
        style={{
          scrollbarGutter: 'stable',
          backgroundImage: `
            linear-gradient(rgba(148,163,184,0.10) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148,163,184,0.10) 1px, transparent 1px),
            linear-gradient(rgba(148,163,184,0.22) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148,163,184,0.22) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px, 20px 20px, 100px 100px, 100px 100px',
          backgroundPosition: `${RULER}px ${RULER}px`,
        }}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        {/* Fix-4: 内容容器用 px 尺寸驱动，避免 100% + 滚动条循环 */}
        <div
          style={{
            paddingLeft: RULER + 12,
            paddingTop: RULER + 12,
            paddingBottom: 12,
            paddingRight: 12,
            width: scaledW > 0 ? scaledW + RULER + 24 : undefined,
            minHeight: scaledH > 0 ? scaledH + RULER + 24 : undefined,
            position: 'relative',
          }}
        >
          {/* spring 缩放：visual transform 走 spring value，layout 仍用逻辑 scale
              这样 spring 中途 layout 不抖，滚动条稳定，只有画面本身 fluid 弹动 */}
          <motion.div
            style={{
              transform: springTransform,
              transformOrigin: 'top left',
              width: scaledW > 0 ? scaledW : undefined,
              height: scaledH > 0 ? scaledH : undefined,
            }}
          >
            {/* contentInnerRef 观察自然尺寸；不受 scale 影响 */}
            <div ref={contentInnerRef} style={{ width: 'max-content' }}>
              <CanvasScaleContext.Provider value={scale}>
                {children}
              </CanvasScaleContext.Provider>
            </div>
          </motion.div>
        </div>
      </div>

      {/* 顶部横标尺（浮层，不受滚动影响）—— 已弃用：改用 RulerOverlay 像素尺 */}
      {/* <div
        className="pointer-events-none absolute z-20 border-b border-slate-200 bg-white/95 backdrop-blur"
        style={{ top: 0, left: RULER, right: 0, height: RULER }}
      >
        <div className="relative h-full">
          {marks.map((m) => (
            <div key={m} className="absolute top-0 h-full" style={{ left: `${m}%` }}>
              <div
                className="absolute bottom-0 w-px bg-slate-300"
                style={{ height: m % 50 === 0 ? 10 : 6 }}
              />
              <span className="absolute bottom-[10px] text-[9px] text-slate-400 -translate-x-1/2 font-mono">
                {m}
              </span>
            </div>
          ))}
        </div>
      </div> */}

      {/* 左侧竖标尺（浮层）—— 已弃用：改用 RulerOverlay 像素尺 */}
      {/* <div
        className="pointer-events-none absolute z-20 border-r border-slate-200 bg-white/95 backdrop-blur"
        style={{ top: RULER, left: 0, bottom: 0, width: RULER }}
      >
        <div className="relative w-full h-full">
          {marks.map((m) => (
            <div key={m} className="absolute left-0 w-full" style={{ top: `${m}%` }}>
              <div
                className="absolute right-0 h-px bg-slate-300"
                style={{ width: m % 50 === 0 ? 10 : 6 }}
              />
              <span className="absolute right-[10px] top-0 -translate-y-1/2 text-[9px] text-slate-400 font-mono">
                {m}
              </span>
            </div>
          ))}
        </div>
      </div> */}

      {/* 左上角标尺交叉处（浮层）—— 已弃用 */}
      {/* <div
        className="pointer-events-none absolute z-30 border-r border-b border-slate-200 bg-white flex items-center justify-center text-[8px] font-semibold text-slate-300"
        style={{ top: 0, left: 0, width: RULER, height: RULER }}
      >
        %
      </div> */}

      {/* Fix-3: 悬浮层放在外层 wrapper，脱离滚动容器 */}
      {/* 右上角：自定义工具栏 slot */}
      {toolbar && (
        <div
          className="absolute z-30"
          style={{
            top: CONTROLS_PAD,
            right: CONTROLS_PAD,
          }}
        >
          {toolbar}
        </div>
      )}

      {/* 右下角：缩放控件 —— chip 材质（薄），浅阴影 */}
      <div
        className="absolute z-30 flex items-center gap-1 rounded-lg border border-slate-200/60 material-thin px-1 py-1 shadow-float"
        style={{
          bottom: CONTROLS_PAD,
          right: CONTROLS_PAD,
        }}
      >
        <ScaleBtn
          label="−"
          onClick={() => {
            markUserAdjusted();
            setScale((s) => clampScale(+(s - SCALE_STEP).toFixed(3)));
          }}
        />
        <button
          onClick={() => {
            markUserAdjusted();
            setScale(1);
          }}
          title="重置到 100%"
          className="min-w-[52px] text-xs font-mono font-semibold text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
        >
          {Math.round(scale * 100)}%
        </button>
        <ScaleBtn
          label="+"
          onClick={() => {
            markUserAdjusted();
            setScale((s) => clampScale(+(s + SCALE_STEP).toFixed(3)));
          }}
        />
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <button
          onClick={handleFitClick}
          title="适应窗口"
          className="text-xs font-medium text-slate-600 px-2 py-1 rounded hover:bg-slate-100 transition-colors flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5"
            />
          </svg>
          适应
        </button>
      </div>

      {/* 鼠标坐标浮标 —— 深色 chip，也走轻材质（backdrop blur 让下方图能透一点） */}
      {cursor && (
        <div
          className="pointer-events-none absolute z-30 rounded-md bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-mono px-2 py-1 shadow-float"
          style={{
            bottom: CONTROLS_PAD + 44,
            right: CONTROLS_PAD,
          }}
        >
          x {cursor.x.toFixed(1)}% · y {cursor.y.toFixed(1)}%
        </div>
      )}

      {/* 左下角：提示 */}
      <div
        className="pointer-events-none absolute z-20 text-[10px] text-slate-400 select-none"
        style={{
          bottom: CONTROLS_PAD,
          left: RULER + CONTROLS_PAD,
        }}
      >
        Cmd/Ctrl + 滚轮缩放
      </div>
    </div>
  );
});

function ScaleBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-6 h-6 flex items-center justify-center rounded text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
    >
      {label}
    </button>
  );
}
