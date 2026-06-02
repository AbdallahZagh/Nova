"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "warning" | "info";

type ToastItem = {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  duration: number;
  visible: boolean;
};

type ShowToastOpts = {
  variant: ToastVariant;
  title: string;
  message?: string;
  /** ms before auto-dismiss. Pass 0 to disable. Default 4500 */
  duration?: number;
};

type ToastContextValue = {
  toast: (opts: ShowToastOpts) => void;
};

// ── Variant config ─────────────────────────────────────────────────────────────

const VARIANT_CONFIG = {
  success: {
    icon: CheckCircle2,
    bar: "bg-success",
    iconCls: "text-success",
    border: "border-success/20",
    bg: "bg-[color-mix(in_srgb,var(--color-success)_5%,var(--color-sidebar))]",
    progress: "bg-success",
  },
  error: {
    icon: XCircle,
    bar: "bg-danger",
    iconCls: "text-danger",
    border: "border-danger/20",
    bg: "bg-[color-mix(in_srgb,var(--color-danger)_5%,var(--color-sidebar))]",
    progress: "bg-danger",
  },
  warning: {
    icon: AlertTriangle,
    bar: "bg-warning",
    iconCls: "text-warning",
    border: "border-warning/20",
    bg: "bg-[color-mix(in_srgb,var(--color-warning)_5%,var(--color-sidebar))]",
    progress: "bg-warning",
  },
  info: {
    icon: Info,
    bar: "bg-accent",
    iconCls: "text-accent",
    border: "border-accent/20",
    bg: "bg-[color-mix(in_srgb,var(--color-accent)_5%,var(--color-sidebar))]",
    progress: "bg-accent",
  },
} satisfies Record<ToastVariant, object>;

// ── Context ────────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside <ToastProvider>");
  return ctx;
}

// ── Single toast item ──────────────────────────────────────────────────────────

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const cfg = VARIANT_CONFIG[item.variant];
  const Icon = cfg.icon;

  // Shrinking progress bar
  const [barWidth, setBarWidth] = useState(100);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!item.visible || item.duration === 0) return;
    const tick = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const pct = Math.max(0, 100 - (elapsed / item.duration) * 100);
      setBarWidth(pct);
      if (pct > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [item.visible, item.duration]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        // layout
        "relative flex w-[340px] items-start gap-3 overflow-hidden",
        // glass card
        "rounded-2xl border backdrop-blur-2xl",
        "shadow-2xl shadow-black/50",
        "px-4 pb-3 pt-3.5",
        // variant tint + border
        cfg.border,
        cfg.bg,
        // enter / exit animation
        "transition-all duration-300 ease-out",
        item.visible
          ? "translate-x-0 opacity-100"
          : "translate-x-[110%] opacity-0",
      )}
    >
      {/* Left accent bar */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-[3px] rounded-l-2xl",
          cfg.bar,
        )}
      />

      {/* Icon */}
      <Icon className={cn("mt-px size-[18px] shrink-0", cfg.iconCls)} />

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-primary">
          {item.title}
        </p>
        {item.message && (
          <p className="mt-0.5 text-xs leading-relaxed text-primary/55">
            {item.message}
          </p>
        )}
      </div>

      {/* Close button */}
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss notification"
        className="shrink-0 rounded-lg p-1 text-primary/35 transition hover:bg-glass-button hover:text-primary"
      >
        <X className="size-3.5" />
      </button>

      {/* Progress bar */}
      {item.duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-glass-button">
          <div
            className={cn("h-full rounded-full", cfg.progress)}
            style={{
              width: `${barWidth}%`,
              opacity: 0.55,
              transition: "width 100ms linear",
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: string) => {
    // Animate out, then remove
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, visible: false } : t)),
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 320);
  }, []);

  const toast = useCallback(
    ({ variant, title, message, duration = 4500 }: ShowToastOpts) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Insert invisible first
      setToasts((prev) => [
        ...prev,
        { id, variant, title, message, duration, visible: false },
      ]);

      // Double rAF → browser has painted → trigger enter transition
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          setToasts((prev) =>
            prev.map((t) => (t.id === id ? { ...t, visible: true } : t)),
          ),
        ),
      );

      // Auto-dismiss
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {mounted &&
        createPortal(
          <div
            aria-label="Notifications"
            className="pointer-events-none fixed right-4 top-4 z-600 flex flex-col items-end gap-2"
          >
            {toasts.map((item) => (
              <div key={item.id} className="pointer-events-auto">
                <ToastCard item={item} onDismiss={dismiss} />
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
