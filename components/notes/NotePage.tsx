"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckSquare,
  ChevronRight,
  Clock,
  Copy,
  FolderKanban,
  Monitor,
  Palette,
  Pin,
  Plus,
  Settings2,
  Trash2,
  Zap,
} from "lucide-react";
import { AutoTextarea } from "@/components/notes/AutoTextarea";
import { ChecklistEditor } from "@/components/notes/ChecklistEditor";
import { ColorDots } from "@/components/notes/ColorDots";
import { useNoteActions } from "@/components/notes/useNoteActions";
import { useNoteDraft } from "@/components/notes/useNoteDraft";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import { createTaskApi } from "@/lib/api/tasks";
import { cn } from "@/lib/cn";
import {
  editedLabel,
  newChecklistItem,
  NOTE_SURFACE,
  noteTitle,
  type Note,
} from "@/lib/notes";

type NotePageProps = {
  note: Note | null;
  defaultProjectId?: string;
  projects: { id: string; title: string }[];
};

function fullDate(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** The whole-page note: a big writing surface that fills the screen, with its controls beside it. */
export function NotePage({ note, defaultProjectId, projects }: NotePageProps) {
  const router = useRouter();
  const { toast } = useToast();
  const actions = useNoteActions();
  const { fields, noteId, saved, status, errorMessage, set, flush, remove } = useNoteDraft({
    note,
    defaults: { projectId: defaultProjectId ?? null },
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [converting, setConverting] = useState(false);
  const [freshChecklist, setFreshChecklist] = useState(false);
  const writingRef = useRef<HTMLDivElement>(null);

  const isSaved = Boolean(noteId);
  const projectName = projects.find((project) => project.id === fields.projectId)?.title;
  const words = wordCount(`${fields.title} ${fields.body}`);

  function leave() {
    if (window.history.length > 1) router.back();
    else router.push("/notes");
  }

  async function done() {
    await flush();
    leave();
  }

  function addChecklist() {
    setFreshChecklist(true);
    set({ checklist: [newChecklistItem()] });
  }

  function focusWriting() {
    writingRef.current?.querySelector("textarea")?.focus();
  }

  async function convertToTask() {
    if (!fields.projectId) return;
    setConverting(true);
    try {
      await flush();
      await createTaskApi(fields.projectId, {
        title: fields.title.trim() || noteTitle({ title: null, preview: fields.body.trim() }),
        description: fields.body,
        priority: "Medium",
        status: "To Do",
        assigneeIds: [],
        dueDate: "",
        subtasks: fields.checklist
          .filter((item) => item.text.trim())
          .map((item) => ({ id: item.id, label: item.text, done: item.done })),
      });
      toast({
        variant: "success",
        title: "Task created",
        message: projectName ? `Added to ${projectName}. The note is still here.` : undefined,
      });
    } catch (error) {
      toast({
        variant: "error",
        title: "Could not create the task",
        message: error instanceof ApiError ? error.message : "Please try again.",
      });
    } finally {
      setConverting(false);
    }
  }

  async function duplicate() {
    if (!saved) return;
    await flush();
    const copy = await actions.duplicate(saved);
    if (copy) router.push(`/notes/${copy.id}`);
  }

  return (
    <div className="-m-6 flex h-[calc(100dvh-4rem)] flex-col md:-m-8">
      <header className="flex shrink-0 items-center gap-3 border-b border-glass px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={() => void done()}
          aria-label="Back to notes"
          className="inline-flex size-10 items-center justify-center rounded-xl border border-glass bg-glass-button text-primary/75 transition hover:text-accent"
        >
          <ArrowLeft className="size-[18px]" />
        </button>
        <nav className="flex min-w-0 items-center gap-1.5 text-sm" aria-label="Breadcrumb">
          <span className="hidden text-primary/50 sm:inline">Notes</span>
          <ChevronRight className="hidden size-3.5 text-primary/35 sm:block" />
          <span className="truncate font-semibold text-primary">
            {fields.title.trim() || (isSaved ? noteTitle({ title: null, preview: fields.body.trim() }) : "New note")}
          </span>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <p
            role="status"
            title={status === "error" ? errorMessage : undefined}
            className={cn(
              "hidden items-center gap-2 text-xs sm:flex",
              status === "error" ? "text-red-400" : "text-primary/55",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                status === "saving"
                  ? "animate-pulse bg-amber-400"
                  : status === "error"
                    ? "bg-red-400"
                    : "bg-emerald-400",
              )}
            />
            {status === "saving"
              ? "Saving…"
              : status === "error"
                ? errorMessage || "Could not save"
                : saved
                  ? `Saved · ${editedLabel(saved.updatedAt)}`
                  : "Saves as you write"}
          </p>
          <button
            type="button"
            onClick={() => void done()}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition hover:opacity-90"
          >
            Done
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6 lg:flex-row lg:overflow-hidden">
        <section
          className={cn(
            "flex min-h-[70vh] min-w-0 flex-1 flex-col overflow-y-auto rounded-3xl border shadow-xl shadow-black/10 transition-colors duration-150 lg:min-h-0",
            NOTE_SURFACE[fields.color],
          )}
        >
          <div className="flex flex-1 flex-col px-6 py-7 md:px-12 md:py-10">
            <input
              value={fields.title}
              autoFocus={!note}
              onChange={(event) => set({ title: event.target.value })}
              placeholder="Untitled"
              aria-label="Title"
              className="w-full bg-transparent text-3xl font-bold tracking-tight text-primary outline-none placeholder:text-primary/25 md:text-4xl"
            />
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-primary/55">
              <span className="inline-flex items-center gap-1.5">
                <FolderKanban className="size-3.5" />
                {projectName ?? "Personal"}
              </span>
              {saved ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {fullDate(saved.updatedAt)}
                </span>
              ) : null}
              {words > 0 ? <span>{words} {words === 1 ? "word" : "words"}</span> : null}
            </div>

            <div className="my-6 h-px bg-primary/10" />

            <div
              ref={writingRef}
              onClick={(event) => {
                if (event.target === event.currentTarget) focusWriting();
              }}
              className="min-h-40 flex-1 cursor-text"
            >
              <AutoTextarea
                value={fields.body}
                onChange={(event) => set({ body: event.target.value })}
                placeholder="Start writing…"
                aria-label="Note"
                className="w-full resize-none bg-transparent text-[17px] leading-8 text-primary outline-none placeholder:text-primary/30"
              />
            </div>

            <div className="mt-6">
              {fields.checklist.length > 0 ? (
                <div className="rounded-2xl border border-primary/10 bg-black/[0.04] p-5 light:bg-white/40">
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary/50">
                    Checklist
                  </h2>
                  <ChecklistEditor
                    autoFocus={freshChecklist}
                    items={fields.checklist}
                    onChange={(checklist) => set({ checklist })}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={addChecklist}
                  className="inline-flex items-center gap-2 rounded-xl border border-dashed border-primary/25 px-4 py-2.5 text-sm font-semibold text-primary/65 transition hover:border-accent/60 hover:text-accent"
                >
                  <Plus className="size-4" />
                  Add a checklist
                </button>
              )}
            </div>
          </div>
        </section>

        <aside className="w-full shrink-0 space-y-4 lg:w-80 lg:overflow-y-auto lg:pr-1">
          <Panel icon={<Palette className="size-3.5" />} title="Colour">
            <ColorDots value={fields.color} onChange={(color) => color && set({ color })} />
          </Panel>

          <Panel icon={<FolderKanban className="size-3.5" />} title="Project">
            <Select
              value={fields.projectId}
              onChange={(projectId) => set({ projectId })}
              aria-label="Project"
              options={[
                { value: "", label: "Personal (no project)" },
                ...projects.map((project) => ({ value: project.id, label: project.title })),
              ]}
            />
            <p className="mt-2 text-xs leading-relaxed text-primary/50">
              A project only groups the note. It stays private to you.
            </p>
          </Panel>

          <Panel icon={<Settings2 className="size-3.5" />} title="Options">
            <div className="space-y-4">
              <OptionRow
                icon={<Pin className="size-4" />}
                label="Pin to top"
                hint="Keep it first on your board"
                checked={fields.pinned}
                onChange={(pinned) => set({ pinned })}
              />
              <OptionRow
                icon={<Monitor className="size-4" />}
                label="Keep on screen"
                hint={
                  fields.floating
                    ? "Floats once you leave here"
                    : "Float it as a sticky on every page"
                }
                checked={fields.floating}
                onChange={(floating) => set({ floating })}
              />
            </div>
          </Panel>

          <Panel icon={<Zap className="size-3.5" />} title="Actions">
            <div className="space-y-2">
              <ActionRow
                icon={<CheckSquare className="size-4" />}
                label={converting ? "Creating…" : "Turn into task"}
                hint={fields.projectId ? undefined : "Pick a project"}
                disabled={!isSaved || !fields.projectId || converting}
                onClick={() => void convertToTask()}
              />
              <ActionRow
                icon={<Copy className="size-4" />}
                label="Duplicate"
                disabled={!isSaved}
                onClick={() => void duplicate()}
              />
              <ActionRow
                icon={<Trash2 className="size-4" />}
                label="Delete note"
                danger
                disabled={!isSaved}
                onClick={() => setConfirmDelete(true)}
              />
            </div>
          </Panel>

          <dl className="space-y-1.5 px-1 pb-2 text-xs text-primary/50">
            <div className="flex justify-between gap-3">
              <dt>Created</dt>
              <dd className="text-primary/70">{fullDate(saved?.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Edited</dt>
              <dd className="text-primary/70">{fullDate(saved?.updatedAt)}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <DeleteConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          if (await remove()) {
            toast({ variant: "success", title: "Note deleted" });
            router.push("/notes");
          }
        }}
        title="Delete note?"
        itemName={saved ? noteTitle(saved) : undefined}
      />
    </div>
  );
}

function Panel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-glass bg-glass-card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary/50">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function OptionRow({
  icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
          checked ? "bg-accent/20 text-accent" : "bg-glass-button text-primary/60",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary">{label}</p>
        <p className="truncate text-xs text-primary/50">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-primary/20",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

function ActionRow({
  icon,
  label,
  hint,
  danger,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
        danger
          ? "border-red-500/30 text-red-400 hover:bg-red-500/10 light:border-red-500/40 light:text-red-600"
          : "border-glass bg-glass-button text-primary/80 hover:text-primary",
      )}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {hint ? <span className="text-xs font-normal text-primary/45">{hint}</span> : null}
    </button>
  );
}
