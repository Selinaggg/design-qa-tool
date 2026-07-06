'use client';

const PLACEHOLDER = `例如：主色调 #1677FF，正文 14px，标题 24px，卡片圆角 8px，模块间距 24px。`;

interface SpecInputProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SpecInput({ value, onChange }: SpecInputProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-slate-700">
        设计规范
        <span className="ml-1.5 text-xs font-normal text-slate-400">（可选，用于 AI 走查分析）</span>
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={3}
        className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
      />
      <p className="text-xs text-slate-400 text-right">{value.length} 字符</p>
    </div>
  );
}
