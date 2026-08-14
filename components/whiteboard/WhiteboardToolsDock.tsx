"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Pen } from "lucide-react";

type WhiteboardToolsDockProps = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: ReactNode;
};

export function WhiteboardToolsDock({
  open,
  onOpen,
  onClose,
  children,
}: WhiteboardToolsDockProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose]);

  if (!open) {
    return (
      <button
        type="button"
        title="Open tools"
        onClick={onOpen}
        className="absolute bottom-4 left-4 z-30 flex size-12 items-center justify-center rounded-full bg-accent text-white shadow-lg hover:bg-accent/90"
      >
        <Pen className="size-5" />
      </button>
    );
  }

  return (
    <div
      ref={rootRef}
      className="absolute bottom-4 left-4 z-30 w-[min(calc(100%-2rem),26rem)]"
    >
      {children}
    </div>
  );
}
