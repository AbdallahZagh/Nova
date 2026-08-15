"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  MoonStar,
  PenLine,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useUser } from "@/components/providers/UserProvider";
import { cn } from "@/lib/cn";
import {
  DEMO_TOUR_STEPS,
  dismissDemoTour,
  hasDismissedDemoTour,
  type DemoTourIcon,
} from "@/lib/demo";

const ICONS: Record<DemoTourIcon, LucideIcon> = {
  sparkles: Sparkles,
  folder: FolderKanban,
  calendar: CalendarDays,
  pen: PenLine,
  moon: MoonStar,
};

export function DemoTourModal() {
  const { profile, loading } = useUser();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (loading || !profile?.isDemo || hasDismissedDemoTour()) {
      setOpen(false);
      return;
    }
    setStep(0);
    setOpen(true);
  }, [loading, profile?.isDemo]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const finish = () => {
    dismissDemoTour();
    setOpen(false);
  };

  const last = step >= DEMO_TOUR_STEPS.length - 1;
  const current = DEMO_TOUR_STEPS[step];

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (last) finish();
        else setStep((value) => value + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setStep((value) => Math.max(0, value - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // finish is stable enough for this overlay; step/last drive the arrows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, last]);

  if (!open || typeof document === "undefined" || !current) return null;

  const Icon = ICONS[current.icon];

  return createPortal(
    <div className="fixed inset-0 z-200 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-tour-title"
        className="relative z-10 flex max-h-[min(92dvh,720px)] w-full max-w-[540px] flex-col overflow-hidden rounded-[28px] border border-glass bg-sidebar shadow-[0_32px_90px_rgba(0,0,0,0.55)]"
      >
        <div className="relative isolate h-40 shrink-0 overflow-hidden sm:h-48">
          <div className="absolute inset-0 bg-linear-180 from-accent/30 from-10% via-accent/8 to-transparent" />
          <div className="absolute -left-16 -top-20 size-64 rounded-full bg-accent/25 blur-3xl" />
          <div className="absolute -right-10 bottom-0 size-48 rounded-full bg-accent/10 blur-3xl" />
          <p className="absolute right-6 top-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/45">
            {step + 1} of {DEMO_TOUR_STEPS.length}
          </p>
          <div className="absolute bottom-6 left-7 flex size-[4.25rem] items-center justify-center rounded-2xl bg-accent text-white shadow-[0_12px_40px_rgba(230,106,23,0.45)]">
            <Icon className="size-8" strokeWidth={1.75} />
          </div>
        </div>

        <div
          key={current.id}
          className="min-h-0 flex-1 overflow-y-auto px-7 pt-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
            {current.eyebrow}
          </p>
          <h2
            id="demo-tour-title"
            className="mt-2 text-[1.7rem] font-semibold leading-[1.2] tracking-tight text-primary"
          >
            {current.title}
          </h2>
          <div className="mt-4 space-y-3">
            {current.paragraphs.map((paragraph) => (
              <p
                key={paragraph}
                className="text-[15px] leading-7 text-primary/68"
              >
                {paragraph}
              </p>
            ))}
          </div>
          {current.highlights?.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {current.highlights.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-accent"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-3 px-6 py-5">
          <button
            type="button"
            onClick={finish}
            className="text-sm font-medium text-primary/45 transition hover:text-primary"
          >
            Skip
          </button>
          <div className="flex flex-1 items-center justify-center gap-1.5">
            {DEMO_TOUR_STEPS.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Go to ${item.eyebrow}`}
                aria-current={index === step}
                onClick={() => setStep(index)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  index === step
                    ? "w-6 bg-accent"
                    : "w-1.5 bg-primary/20 hover:bg-primary/35",
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((value) => value - 1)}
                aria-label="Back"
                className="flex size-10 items-center justify-center rounded-xl border border-glass bg-glass-button text-primary/70 transition hover:text-accent"
              >
                <ChevronLeft className="size-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => (last ? finish() : setStep((value) => value + 1))}
              className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-accent px-4 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition hover:opacity-90"
            >
              {last ? "Start exploring" : "Next"}
              {last ? null : <ChevronRight className="size-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
