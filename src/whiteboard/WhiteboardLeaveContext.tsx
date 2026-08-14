import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import type { PropsWithChildren } from "react";

export const WHITEBOARD_LEAVE_BACK = "__back__";

type LeaveBlocker = {
  tryLeave: (href: string) => boolean;
};

type WhiteboardLeaveContextValue = {
  register: (blocker: LeaveBlocker | null) => void;
  tryLeave: (href: string) => boolean;
};

const WhiteboardLeaveContext = createContext<WhiteboardLeaveContextValue>({
  register: () => {},
  tryLeave: () => false,
});

export function WhiteboardLeaveProvider({ children }: PropsWithChildren) {
  const blockerRef = useRef<LeaveBlocker | null>(null);

  const register = useCallback((blocker: LeaveBlocker | null) => {
    blockerRef.current = blocker;
  }, []);

  const tryLeave = useCallback((href: string) => {
    return blockerRef.current?.tryLeave(href) ?? false;
  }, []);

  const value = useMemo(() => ({ register, tryLeave }), [register, tryLeave]);

  return (
    <WhiteboardLeaveContext.Provider value={value}>
      {children}
    </WhiteboardLeaveContext.Provider>
  );
}

export function useWhiteboardLeave() {
  return useContext(WhiteboardLeaveContext);
}
