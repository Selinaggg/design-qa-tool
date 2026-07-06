'use client';

import type { CrossPlatformAuditResult } from '@/lib/crossPlatform';

interface ScoreGridProps {
  result: CrossPlatformAuditResult;
}

export default function ScoreGrid({ result }: ScoreGridProps) {
  const { designFidelity, platformConsistencyScore, overallScore } = result;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {designFidelity && (
        <>
          <ScoreCard label="iOS 设计还原度" score={designFidelity.ios} accent="blue" />
          <ScoreCard label="Android 设计还原度" score={designFidelity.android} accent="green" />
        </>
      )}
      {!designFidelity && <div className="col-span-2" />}
      <ScoreCard label="跨端一致性" score={platformConsistencyScore} accent="purple" />
      <ScoreCard label="综合评分" score={overallScore} accent="slate" emphasis />
    </div>
  );
}

const accentMap = {
  blue:   { ring: 'ring-blue-200',   text: 'text-blue-600',   bg: 'bg-blue-50' },
  green:  { ring: 'ring-green-200',  text: 'text-green-600',  bg: 'bg-green-50' },
  purple: { ring: 'ring-purple-200', text: 'text-purple-600', bg: 'bg-purple-50' },
  slate:  { ring: 'ring-slate-200',  text: 'text-slate-700',  bg: 'bg-slate-50' },
} as const;

function ScoreCard({
  label,
  score,
  accent,
  emphasis,
}: {
  label: string;
  score: number;
  accent: keyof typeof accentMap;
  emphasis?: boolean;
}) {
  const { ring, text, bg } = accentMap[accent];
  const grade = score >= 90 ? '优秀' : score >= 75 ? '良好' : score >= 60 ? '一般' : '较差';

  return (
    <div className={`rounded-2xl border ${ring} ring-1 ${bg} p-4 flex flex-col gap-1 ${emphasis ? 'ring-2' : ''}`}>
      <div className={`text-3xl font-bold tabular-nums ${text}`}>{score}</div>
      <div className="text-xs text-slate-500 leading-tight">{label}</div>
      <div className={`text-xs font-semibold ${text} mt-0.5`}>{grade}</div>
    </div>
  );
}
