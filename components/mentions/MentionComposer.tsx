"use client";

import { useMemo, useRef, useState } from "react";
import { inputVariants } from "@/components/ui/fieldVariants";
import {
  filterMentionUsers,
  insertMention,
  mentionQueryAtCaret,
  type MentionUser,
} from "@/lib/mentions";
import { cn } from "@/lib/cn";

type MentionComposerProps = {
  value: string;
  onChange: (value: string) => void;
  users: MentionUser[];
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  className?: string;
};

export function MentionComposer({
  value,
  onChange,
  users,
  placeholder,
  disabled,
  rows = 3,
  className,
}: MentionComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const active = mentionQueryAtCaret(value, caret);
  const suggestions = useMemo(
    () => (active ? filterMentionUsers(users, active.query) : []),
    [active, users],
  );

  const apply = (user: MentionUser) => {
    const next = insertMention(value, caret, user.username);
    onChange(next.value);
    window.setTimeout(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    }, 0);
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          inputVariants.minimal,
          "resize-none focus:bg-glass-button/40",
          className,
        )}
        onChange={(event) => {
          onChange(event.target.value);
          setCaret(event.target.selectionStart ?? event.target.value.length);
        }}
        onClick={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
        onKeyUp={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
      />
      {suggestions.length > 0 ? (
        <div className="absolute bottom-full z-20 mb-1 w-full overflow-hidden rounded-xl border border-glass bg-sidebar shadow-lg">
          {suggestions.map((user) => (
            <button
              key={user.id}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                apply(user);
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-glass-button"
            >
              <span className="font-semibold text-accent">{user.username}</span>
              <span className="truncate text-xs text-primary/55">{user.fullName}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
