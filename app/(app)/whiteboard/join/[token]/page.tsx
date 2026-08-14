"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import {
  acceptWhiteboardInviteApi,
  getWhiteboardInviteApi,
} from "@/lib/api/whiteboards";

export default function WhiteboardJoinPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const token = typeof params.token === "string" ? params.token : "";
  const [title, setTitle] = useState("Whiteboard");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!token) return;
    void getWhiteboardInviteApi(token)
      .then((invite) => {
        setTitle(invite.title);
        setRole(invite.role.toLowerCase());
      })
      .catch((err: unknown) => {
        toast({
          variant: "error",
          title: "Invite unavailable",
          message: err instanceof ApiError ? err.message : "This link is invalid.",
        });
      })
      .finally(() => setLoading(false));
  }, [token, toast]);

  const join = async () => {
    setJoining(true);
    try {
      const board = await acceptWhiteboardInviteApi(token);
      router.replace(`/whiteboard/${board.id}`);
    } catch (err) {
      setJoining(false);
      toast({
        variant: "error",
        title: "Could not join",
        message: err instanceof ApiError ? err.message : "This link may already be used.",
      });
    }
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-20 text-center">
      <h1 className="text-2xl font-semibold text-primary">Join whiteboard</h1>
      {loading ? (
        <p className="text-sm text-primary/55">Checking invite...</p>
      ) : (
        <>
          <p className="text-sm text-primary/60">
            You were invited to <span className="font-semibold text-primary">{title}</span>
            {role ? ` as ${role}` : ""}. This link can only be used once.
          </p>
          <button
            type="button"
            onClick={() => void join()}
            disabled={joining}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {joining ? "Joining..." : "Join board"}
          </button>
        </>
      )}
    </div>
  );
}
