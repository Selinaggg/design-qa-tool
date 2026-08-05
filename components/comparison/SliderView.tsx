'use client';

import { useState, useEffect, useRef } from 'react';
import type { ImageFile } from '@/types';

interface SliderViewProps {
  designImage: ImageFile;
  liveImage: ImageFile;
  leftLabel?: string;
  rightLabel?: string;
}

export default function SliderView({ designImage, liveImage, leftLabel = '← 设计稿', rightLabel = '线上页面 →' }: SliderViewProps) {
  const [sliderPos, setSliderPos] = useState(50); // percentage
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Global mouse/pointer event handling — attach when dragging starts
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setSliderPos(Math.max(0, Math.min(100, (x / rect.width) * 100)));
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
  };

  // Click anywhere on the container to jump the slider
  const handleContainerClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setSliderPos(Math.max(0, Math.min(100, (x / rect.width) * 100)));
  };

  return (
    <div className="flex flex-col gap-3 select-none">
      {/* Labels */}
      <div className="flex justify-between text-xs font-semibold uppercase tracking-wide text-slate-500 px-1">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>

      {/* Slider container — CSS Grid overlay trick */}
      <div
        ref={containerRef}
        onClick={handleContainerClick}
        className="relative overflow-hidden rounded-xl border border-slate-200 cursor-col-resize"
      >
        {/* width:100% breaks the circular dependency in the auto column,
            so images scale to container width instead of natural width */}
        <div style={{ display: 'grid', width: '100%' }}>
          {/* Design image — visible on the LEFT of the divider */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={designImage.url}
            alt="设计稿"
            draggable={false}
            style={{
              gridArea: '1/1',
              width: '100%',
              display: 'block',
              clipPath: `inset(0 ${100 - sliderPos}% 0 0)`,
            }}
          />
          {/* Live image — visible on the RIGHT of the divider */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={liveImage.url}
            alt="线上页面"
            draggable={false}
            style={{
              gridArea: '1/1',
              width: '100%',
              display: 'block',
              clipPath: `inset(0 0 0 ${sliderPos}%)`,
            }}
          />
        </div>

        {/* Divider line */}
        <div
          style={{ left: `${sliderPos}%` }}
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.12)] -translate-x-1/2 z-10"
        >
          {/* Drag handle */}
          <button
            onMouseDown={handleDividerMouseDown}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 bg-white rounded-full shadow-lg border border-slate-200 flex items-center justify-center cursor-ew-resize hover:border-blue-400 transition-colors"
            aria-label="拖拽调整分割线位置"
          >
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 9l-4 3 4 3M16 9l4 3-4 3" />
            </svg>
          </button>

          {/* Top label chip */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-1">
            <span className="bg-black/50 text-white text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap backdrop-blur-sm">
              {Math.round(sliderPos)}%
            </span>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400 text-center">
        拖拽中间分割线，或点击任意位置调整对比区域
      </p>
    </div>
  );
}
