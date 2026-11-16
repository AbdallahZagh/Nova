"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { NotePage } from "@/components/notes/NotePage";
import { useAppData } from "@/components/providers/AppDataProvider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/Skeleton";
import { getNoteApi } from "@/lib/api/notes";
import type { Note } from "@/lib/notes";

function NotePageSkeleton() {
  return (
    <div className="-m-6 flex h-[calc(100dvh-4rem)] flex-col overflow-hidden md:-m-8">
      <div className="flex items-center gap-3 border-b border-glass px-4 py-3 md:px-6">
        <Skeleton className="size-10 rounded-xl" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="ml-auto h-10 w-24 rounded-xl" />
      </div>
      <div className="flex min-h-0 flex-1 gap-4 p-4 md:p-6">
        <Skeleton className="flex-1 rounded-3xl" />
        <div className="hidden w-80 space-y-4 lg:block">
          {[80, 120, 120, 170].map((height, index) => (
            <Skeleton key={index} className="w-full rounded-2xl" style={{ height }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function NoteRoute() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { projects } = useAppData();
  const id = params.id;
  const isNew = id === "new";
  const [note, setNote] = useState<Note | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    getNoteApi(id)
      .then((loaded) => {
        if (!cancelled) setNote(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const projectOptions = useMemo(
    () => projects.map((project) => ({ id: project.id, title: project.title })),
    [projects],
  );

  if (failed) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h1 className="text-xl font-semibold text-primary">This note is gone</h1>
        <p className="mt-1 text-sm text-primary/60">It may have been deleted, or it is not yours.</p>
        <Button variant="accent" className="mt-5" onClick={() => router.push("/notes")}>
          Back to notes
        </Button>
      </div>
    );
  }

  if (!isNew && !note) return <NotePageSkeleton />;

  return (
    <NotePage
      key={note?.id ?? "new"}
      note={note}
      defaultProjectId={searchParams.get("projectId") ?? undefined}
      projects={projectOptions}
    />
  );
}

export default function NoteRoutePage() {
  return (
    <Suspense fallback={<NotePageSkeleton />}>
      <NoteRoute />
    </Suspense>
  );
}
