"use client";

import { cn } from "@/lib/cn";

type ThicknessSliderProps = {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

export function ThicknessSlider({
  value,
  min,
  max,
  onChange,
}: ThicknessSliderProps) {
  const ratio = Math.min(1, Math.max(0, (value - min) / Math.max(1, max - min)));
  const fill = Math.max(6, ratio * 100);
  const fillTop = 10 - 8 * ratio;
  const fillBottom = 10 + 8 * ratio;

  return (
    <div className="relative flex h-10 min-w-44 flex-1 items-center">
      <svg
        className="pointer-events-none absolute inset-x-1 top-1/2 h-4 w-[calc(100%-8px)] -translate-y-1/2 text-primary/18"
        viewBox="0 0 100 20"
        preserveAspectRatio="none"
        aria-hidden
      >
        <polygon points="0,10 100,2 100,18" fill="currentColor" />
        <polygon
          className="text-accent"
          fill="currentColor"
          points={`0,10 ${fill},${fillTop} ${fill},${fillBottom}`}
        />
      </svg>
      <div
        className="pointer-events-none absolute top-1/2 z-10 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sidebar bg-accent shadow"
        style={{ left: `${ratio * 100}%` }}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cn(
          "absolute inset-0 z-20 w-full cursor-pointer appearance-none bg-transparent",
          "[&::-webkit-slider-runnable-track]:h-10 [&::-webkit-slider-runnable-track]:bg-transparent",
          "[&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-transparent",
          "[&::-moz-range-track]:h-10 [&::-moz-range-track]:bg-transparent",
          "[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent",
        )}
      />
    </div>
  );
}
