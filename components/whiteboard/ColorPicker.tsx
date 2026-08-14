"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/cn";
import { toHexColor } from "@/lib/whiteboard/theme";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToHsv(hex: string) {
  const raw = toHexColor(hex).slice(1);
  const num = Number.parseInt(raw, 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToHex(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

type ColorPickerProps = {
  color: string;
  onChange: (color: string) => void;
};

export function ColorPicker({ color, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hsv = hexToHsv(color);
  const [hue, setHue] = useState(hsv.h);
  const [sat, setSat] = useState(hsv.s);
  const [val, setVal] = useState(hsv.v);
  const preview = hsvToHex(hue, sat, val);
  const hueColor = hsvToHex(hue, 1, 1);

  useEffect(() => {
    if (!open) return;
    const next = hexToHsv(color);
    setHue(next.h);
    setSat(next.s);
    setVal(next.v);
  }, [color, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const pickSquare = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextSat = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const nextVal = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1);
    setSat(nextSat);
    setVal(nextVal);
    onChange(hsvToHex(hue, nextSat, nextVal));
  };

  const pickHue = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextHue = clamp(((event.clientX - rect.left) / rect.width) * 360, 0, 360);
    setHue(nextHue);
    onChange(hsvToHex(nextHue, sat, val));
  };

  const capturePick =
    (handler: (event: ReactPointerEvent<HTMLDivElement>) => void) =>
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      handler(event);
    };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title="Pick any color"
        onClick={() => setOpen((current) => !current)}
        className="flex size-8 items-center justify-center rounded-full border border-glass"
      >
        <span
          className="size-6 rounded-full border border-glass"
          style={{
            background:
              "conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)",
          }}
        />
      </button>
      {open ? (
        <div className="absolute left-0 top-10 z-50 w-56 rounded-2xl border border-glass bg-sidebar p-3 shadow-xl">
          <div
            className="relative h-36 w-full cursor-crosshair overflow-hidden rounded-xl"
            style={{ background: hueColor }}
            onPointerDown={capturePick(pickSquare)}
            onPointerMove={(event) => {
              if (event.buttons) pickSquare(event);
            }}
          >
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to right, #fff, transparent)" }}
            />
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to top, #000, transparent)" }}
            />
            <span
              className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{ left: `${sat * 100}%`, top: `${(1 - val) * 100}%` }}
            />
          </div>
          <div
            className="relative mt-3 h-4 w-full cursor-pointer rounded-full"
            style={{
              background:
                "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
            }}
            onPointerDown={capturePick(pickHue)}
            onPointerMove={(event) => {
              if (event.buttons) pickHue(event);
            }}
          >
            <span
              className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{ left: `${(hue / 360) * 100}%`, backgroundColor: hueColor }}
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span
              className="size-7 rounded-lg border border-glass"
              style={{ backgroundColor: preview }}
            />
            <span className="text-xs font-medium uppercase tracking-wide text-primary/60">
              {preview}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
