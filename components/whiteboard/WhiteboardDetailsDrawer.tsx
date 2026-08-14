"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { MentionComposer } from "@/components/mentions/MentionComposer";
import { MentionText } from "@/components/mentions/MentionText";
import { GlassCard } from "@/components/ui/GlassCard";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import {
  createWhiteboardCommentApi,
  deleteWhiteboardCommentApi,
  listWhiteboardActivityApi,
  listWhiteboardCommentsApi,
  type WhiteboardActivity,
  type WhiteboardComment,
} from "@/lib/api/whiteboards";
import { normalizeMention, type MentionUser } from "@/lib/mentions";
import { formatActivityTime } from "@/lib/tasks";
import { whiteboardActivityMessage } from "@/lib/whiteboard/activity";
import type { Whiteboard } from "@/lib/whiteboard/types";
import { canDrawOnBoard } from "@/lib/whiteboard/types";

export type WhiteboardDetailsTab = "history" | "comments";

function DetailsSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-12 w-3/4 rounded-xl" />
    </div>
  );
}

function activityTypeLabel(type: string) {
  if (type === "STATUS_CHANGE") return "Status";
  if (type === "COMMENT_ADDED") return "Comment";
  if (type === "TITLE_CHANGED") return "Title";
  if (type === "SNAPSHOT_SAVED") return "Snapshot";
  return type.replace(/_/g, " ");
}

export function WhiteboardDetailsDrawer({
  board,
  pageId,
  open,
  tab,
  currentUserId,
  onClose,
}: {
  board: Whiteboard;
  pageId?: string;
  open: boolean;
  tab: WhiteboardDetailsTab;
  currentUserId?: string;
  onTabChange?: (tab: WhiteboardDetailsTab) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [activity, setActivity] = useState<WhiteboardActivity[]>([]);
  const [comments, setComments] = useState<WhiteboardComment[]>([]);
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
          username: normalizeMention(member.username!),
          fullName: member.fullName,
        })),
    [board.members],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading when the drawer opens
    setLoading(true);
    void Promise.all([
      listWhiteboardActivityApi(board.id),
      listWhiteboardCommentsApi(board.id),
    ])
      .then(([history, rows]) => {
        if (cancelled) return;
        setActivity(history);
        setComments(rows);
      })
      .catch((err: unknown) => {
        toast({
          variant: "error",
          title: "Could not load board details",
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
      setComments((current) => [created, ...current]);
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
      setComments((current) => current.filter((item) => item.id !== commentId));
    } catch (err) {
      toast({
        variant: "error",
        title: "Could not delete comment",
        message: err instanceof ApiError ? err.message : "Please try again.",
      });
    }
  };

  const commentsCard = (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-primary/60">
          Comments
        </h3>
        <span className="text-xs text-primary/40">{comments.length}</span>
      </div>
      {canComment ? (
        <div className="mt-3 space-y-2">
          <MentionComposer
            value={content}
            onChange={setContent}
            users={users}
            placeholder="Add a board comment. Use @ to mention someone."
            disabled={submitting}
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!content.trim() || submitting}
            className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Posting..." : "Add Comment"}
          </button>
        </div>
      ) : null}
      {loading ? (
        <div className="mt-4">
          <DetailsSkeleton />
        </div>
      ) : comments.length === 0 ? (
        <p className="mt-4 text-sm text-primary/50">No comments yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {comments.map((item) => {
            const canDelete =
              item.createdById === currentUserId || board.myRole === "ADMIN";
            return (
              <li
                key={item.id}
                className="rounded-xl border border-glass bg-glass-button/40 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-primary">
                      {item.createdBy?.fullName || "Someone"}
                    </p>
                    <p className="mt-0.5 text-xs text-primary/45">
                      {formatActivityTime(item.createdAt)}
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
                <p className="mt-3 text-sm leading-relaxed text-primary/75">
                  <MentionText content={item.content} />
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );

  const historyCard = (
    <GlassCard className="p-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-primary/60">
        Activity
      </h3>
      {loading ? (
        <div className="mt-3">
          <DetailsSkeleton />
        </div>
      ) : activity.length === 0 ? (
        <p className="mt-3 text-sm text-primary/50">No activity yet.</p>
      ) : (
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
          {activity.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-glass bg-glass-button/40 px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm leading-snug text-primary/85">
                  {whiteboardActivityMessage(item)}
                </p>
                <span className="shrink-0 rounded-md bg-glass-button px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary/45">
                  {activityTypeLabel(item.type)}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-primary/50">
                {item.actor?.fullName ? (
                  <>
                    <span className="font-medium text-primary/65">
                      {item.actor.fullName}
                    </span>
                    <span className="text-primary/35"> · </span>
                  </>
                ) : null}
                {formatActivityTime(item.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );

  return (
    <SideDrawer isOpen={open} onClose={onClose} title="Board Details">
      <div className="space-y-4">
        {tab === "comments" ? (
          <>
            {commentsCard}
            {historyCard}
          </>
        ) : (
          <>
            {historyCard}
            {commentsCard}
          </>
        )}
      </div>
    </SideDrawer>
  );
}
