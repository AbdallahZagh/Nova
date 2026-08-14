"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { MentionComposer } from "@/components/mentions/MentionComposer";
import { MentionText } from "@/components/mentions/MentionText";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import {
  createWhiteboardCommentApi,
  deleteWhiteboardCommentApi,
  listWhiteboardCommentsApi,
  type WhiteboardComment,
} from "@/lib/api/whiteboards";
import type { MentionUser } from "@/lib/mentions";
import type { Whiteboard } from "@/lib/whiteboard/types";
import { canDrawOnBoard } from "@/lib/whiteboard/types";

export function WhiteboardCommentsDrawer({
  board,
  pageId,
  open,
  currentUserId,
  onClose,
}: {
  board: Whiteboard;
  pageId?: string;
  open: boolean;
  currentUserId?: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<WhiteboardComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canComment = canDrawOnBoard(board.myRole);
  const users = useMemo<MentionUser[]>(
    () =>
      board.members
        .filter((member) => member.username)
        .map((member) => ({
          id: member.userId,
          username: member.username!,
          fullName: member.fullName,
        })),
    [board.members],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void listWhiteboardCommentsApi(board.id)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((err: unknown) => {
        toast({
          variant: "error",
          title: "Could not load comments",
          message: err instanceof ApiError ? err.message : "Please try again.",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [board.id, open, toast]);

  const submit = async () => {
    const next = content.trim();
    if (!next || submitting) return;
    setSubmitting(true);
    try {
      const created = await createWhiteboardCommentApi(board.id, {
        content: next,
        pageId,
      });
      setItems((current) => [created, ...current]);
      setContent("");
    } catch (err) {
      toast({
        variant: "error",
        title: "Could not post comment",
        message: err instanceof ApiError ? err.message : "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (commentId: string) => {
    try {
      await deleteWhiteboardCommentApi(board.id, commentId);
      setItems((current) => current.filter((item) => item.id !== commentId));
    } catch (err) {
      toast({
        variant: "error",
        title: "Could not delete comment",
        message: err instanceof ApiError ? err.message : "Please try again.",
      });
    }
  };

  return (
    <SideDrawer isOpen={open} onClose={onClose} title="Comments">
      {canComment ? (
        <div className="mb-4 space-y-2">
          <MentionComposer
            value={content}
            onChange={setContent}
            users={users}
            placeholder="Write a comment. Use @ to mention someone on the board."
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!content.trim() || submitting}
            className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? "Posting..." : "Comment"}
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-primary/50">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Loading comments...
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-primary/50">
          No comments yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const canDelete =
              item.createdById === currentUserId || board.myRole === "ADMIN";
            return (
              <li
                key={item.id}
                className="rounded-xl border border-glass bg-glass-button/40 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-primary">
                      {item.createdBy?.fullName || "Someone"}
                    </p>
                    <p className="text-xs text-primary/45">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => void remove(item.id)}
                      className="rounded-lg p-1 text-primary/40 hover:text-danger"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-primary/75">
                  <MentionText content={item.content} />
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </SideDrawer>
  );
}
