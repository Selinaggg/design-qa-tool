'use client';

import DropZone from './DropZone';
import FigmaImport from './FigmaImport';
import UrlCapture from './UrlCapture';
import type { ImageFile } from '@/types';

interface UploadPanelProps {
  designImage: ImageFile | null;
  liveImage: ImageFile | null;
  sizeError: string | null;
  onDesignLoad: (img: ImageFile) => void;
  onDesignRemove: () => void;
  onLiveLoad: (img: ImageFile) => void;
  onLiveRemove: () => void;
}

export default function UploadPanel({
  designImage,
  liveImage,
  sizeError,
  onDesignLoad,
  onDesignRemove,
  onLiveLoad,
  onLiveRemove,
}: UploadPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Design column */}
        <div className="flex flex-col gap-3">
          <DropZone
            label="设计稿截图"
            image={designImage}
            onImageLoad={onDesignLoad}
            onImageRemove={onDesignRemove}
          />
          {!designImage && (
            <>
              <Divider />
              <FigmaImport onImageLoad={onDesignLoad} />
            </>
          )}
        </div>

        {/* Live column */}
        <div className="flex flex-col gap-3">
          <DropZone
            label="线上页面截图"
            image={liveImage}
            onImageLoad={onLiveLoad}
            onImageRemove={onLiveRemove}
          />
          {!liveImage && (
            <>
              <Divider />
              <UrlCapture onImageLoad={onLiveLoad} />
            </>
          )}
        </div>
      </div>

      {sizeError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <svg className="mt-0.5 w-4 h-4 flex-shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-sm text-amber-700">{sizeError}</p>
        </div>
      )}
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px bg-slate-200" />
      <span className="text-xs text-slate-400">或</span>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}
