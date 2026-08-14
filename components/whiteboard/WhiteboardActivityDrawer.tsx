"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import {
  listWhiteboardActivityApi,
  type WhiteboardActivity,
} from "@/lib/api/whiteboards";
import { whiteboardActivityMessage } from "@/lib/whiteboard/activity";

export function WhiteboardActivityDrawer({
  boardId,
  open,
  onClose,
}: {
  boardId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<WhiteboardActivity[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void listWhiteboardActivityApi(boardId)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((err: unknown) => {
        toast({
          variant: "error",
          title: "Could not load history",
          message: err instanceof ApiError ? err.message : "Please try again.",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, open, toast]);

  return (
    <SideDrawer isOpen={open} onClose={onClose} title="Board history">
      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-primary/50">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Loading history...
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-primary/50">
          No activity yet.
        </p>
      ) : (
        <ol className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-glass bg-glass-button/40 px-3 py-3"
            >
              <p className="text-sm font-medium text-primary">
                {whiteboardActivityMessage(item)}
              </p>
              <p className="mt-1 text-xs text-primary/45">
                {new Date(item.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ol>
      )}
    </SideDrawer>
  );
}
