"use client";

import { useEffect, useRef } from "react";

type UseLeaveBoardGuardOptions = {
  active: boolean;
  fallbackHref: string;
  onLeaveAttempt: (href: string) => void;
};

export function useLeaveBoardGuard({
  active,
  fallbackHref,
  onLeaveAttempt,
}: UseLeaveBoardGuardOptions) {
  const allowRef = useRef(false);
  const pendingRef = useRef<string | null>(null);
  const onLeaveAttemptRef = useRef(onLeaveAttempt);
  const fallbackRef = useRef(fallbackHref);
  onLeaveAttemptRef.current = onLeaveAttempt;
  fallbackRef.current = fallbackHref;

  useEffect(() => {
    if (!active) return;

    history.pushState({ boardGuard: true }, "", window.location.href);

    const onPopState = () => {
      if (allowRef.current) return;
      history.pushState({ boardGuard: true }, "", window.location.href);
      pendingRef.current = "__back__";
      onLeaveAttemptRef.current("__back__");
    };

    const onClick = (event: MouseEvent) => {
      if (allowRef.current || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = (event.target as HTMLElement | null)?.closest("a");
      if (!target) return;
      if (target.target === "_blank" || target.hasAttribute("download")) return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      pendingRef.current = `${url.pathname}${url.search}${url.hash}`;
      onLeaveAttemptRef.current(pendingRef.current);
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [active]);

  return {
    setDestination(href: string) {
      pendingRef.current = href;
    },
    clearDestination() {
      pendingRef.current = null;
    },
    consumeDestination(fallback: string) {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending || pending === "__back__") return fallback;
      return pending;
    },
    allowLeave() {
      allowRef.current = true;
    },
  };
}
