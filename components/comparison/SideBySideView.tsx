'use client';

import type { ImageFile } from '@/types';

interface SideBySideViewProps {
  designImage: ImageFile;
  liveImage: ImageFile;
}

export default function SideBySideView({ designImage, liveImage }: SideBySideViewProps) {
  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <ImagePane label="设计稿" image={designImage} />
      <ImagePane label="线上页面" image={liveImage} />
    </div>
  );
}

function ImagePane({ label, image }: { label: string; image: ImageFile }) {
  return (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
        <span className="text-xs text-slate-400">
          {image.width} × {image.height} px
        </span>
      </div>
      <div className="flex-1 overflow-auto rounded-lg border border-slate-200 bg-[#f0f0f0] bg-[image:repeating-conic-gradient(#e0e0e0_0%_25%,transparent_0%_50%)] bg-[size:16px_16px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={label}
          className="max-w-full block"
          draggable={false}
        />
      </div>
    </div>
  );
}
