"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Compass } from "lucide-react";
import { useUser } from "@/components/providers/UserProvider";
import {
  DEMO_TOUR_POINTS,
  dismissDemoTour,
  hasDismissedDemoTour,
} from "@/lib/demo";

export function DemoTourModal() {
  const { profile, loading } = useUser();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !profile?.isDemo || hasDismissedDemoTour()) {
      setOpen(false);
      return;
    }
    setOpen(true);
  }, [loading, profile?.isDemo]);

  if (!open || typeof document === "undefined") return null;

  const close = () => {
    dismissDemoTour();
    setOpen(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-200 flex items-end justify-center p-4 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close demo tour"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={close}
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-glass bg-sidebar p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Compass className="size-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              Demo workspace
            </p>
            <h2 className="mt-1 text-lg font-semibold text-primary">
              You are in a shared Nova sandbox
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-primary/60">
              Try the product. This account is public, so skip personal data.
            </p>
          </div>
        </div>
        <ul className="mt-5 space-y-3">
          {DEMO_TOUR_POINTS.map((item) => (
            <li
              key={item.title}
              className="rounded-xl border border-glass bg-glass-button/40 px-3 py-3"
            >
              <p className="text-sm font-semibold text-primary">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-primary/60">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={close}
          className="mt-5 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
        >
          Got it
        </button>
      </div>
    </div>,
    document.body,
  );
}
