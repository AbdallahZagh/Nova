"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { getInitials } from "@/components/providers/UserProvider";
import { cn } from "@/lib/cn";
import {
  groupOnlinePresence,
  presenceDeviceLabel,
  type WhiteboardPresence,
} from "@/lib/whiteboard/types";

type WhiteboardPresenceBarProps = {
  people: WhiteboardPresence[];
};

export function WhiteboardPresenceBar({ people }: WhiteboardPresenceBarProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const online = groupOnlinePresence(people);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (online.length === 0) {
    return (
      <p className="text-xs text-primary/45">No one is online</p>
    );
  }

  const extra = Math.max(0, online.length - 5);
  const visible = online.slice(0, 5);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title="Online on this board"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center"
      >
        {visible.map((peer, index) => (
          <span
            key={peer.userId}
            className={cn(
              "relative flex size-7 items-center justify-center rounded-full border text-[9px] font-bold text-white",
              index > 0 && "-ml-1.5",
              peer.drawing ? "border-accent" : "border-sidebar",
            )}
            style={{ backgroundColor: peer.color, zIndex: visible.length - index }}
          >
            {getInitials(peer.name)}
            <span className="absolute -bottom-1 -right-1 flex gap-0.5">
              {peer.platforms.map((platform) => (
                <span
                  key={platform}
                  className="flex size-3 items-center justify-center rounded-full bg-sidebar text-primary"
                >
                  {platform === "web" ? (
                    <Monitor className="size-2" />
                  ) : (
                    <Smartphone className="size-2" />
                  )}
                </span>
              ))}
            </span>
          </span>
        ))}
        {extra > 0 ? (
          <span className="-ml-1.5 flex size-7 items-center justify-center rounded-full border border-sidebar bg-glass-button text-[9px] font-bold text-primary">
            +{extra}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-9 z-50 w-64 rounded-2xl border border-glass bg-sidebar p-2 shadow-xl">
          <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary/45">
            On this board
          </p>
          {online.map((peer) => (
            <div
              key={peer.userId}
              className="flex items-center gap-2 rounded-xl px-2 py-1.5"
            >
              <span
                className="flex size-8 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: peer.color }}
              >
                {getInitials(peer.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary">
                  {peer.isSelf ? `${peer.name} (you)` : peer.name}
                </p>
                <p className="flex flex-wrap items-center gap-1 text-[11px] text-primary/55">
                  {peer.platforms.map((platform) => {
                    const phone = platform === "ios" || platform === "android";
                    return (
                      <span key={platform} className="inline-flex items-center gap-0.5">
                        {phone ? (
                          <Smartphone className="size-3" />
                        ) : (
                          <Monitor className="size-3" />
                        )}
                        {presenceDeviceLabel(platform)}
                      </span>
                    );
                  })}
                  {peer.drawing ? <span>· drawing</span> : null}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
