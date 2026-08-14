"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { UserProfileLink } from "@/components/users/UserProfileLink";
import { searchUsersApi, type SearchUser } from "@/lib/api/users";
import { cn } from "@/lib/cn";
import type { ProjectMemberRole } from "@/lib/projects";

export type SelectedProjectMember = {
  user: SearchUser;
  role: Exclude<ProjectMemberRole, "OWNER">;
};

type ProjectMemberPickerProps = {
  value: SelectedProjectMember[];
  onChange: (members: SelectedProjectMember[]) => void;
  excludeUserIds?: string[];
  placeholder?: string;
  disabled?: boolean;
  candidates?: SearchUser[];
};

const MEMBER_ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "MEMBER", label: "Member" },
  { value: "VIEWER", label: "Viewer" },
];

export function ProjectMemberPicker({
  value,
  onChange,
  excludeUserIds = [],
  placeholder = "Search by name or email...",
  disabled = false,
  candidates,
}: ProjectMemberPickerProps) {
  const generatedId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [resultQuery, setResultQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [close, isOpen]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    if (candidates) {
      const needle = trimmed.toLowerCase();
      setResults(
        candidates.filter(
          (user) =>
            user.fullName.toLowerCase().includes(needle) ||
            user.email.toLowerCase().includes(needle),
        ),
      );
      setResultQuery(trimmed);
      return;
    }

    const timeout = window.setTimeout(() => {
      setLoading(true);
      searchUsersApi(trimmed)
        .then((users) => {
          setResults(users);
          setResultQuery(trimmed);
        })
        .catch(() => {
          setResults([]);
          setResultQuery(trimmed);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [candidates, query]);

  const selectedIds = new Set(value.map((member) => member.user.id));
  const excludedIds = new Set(excludeUserIds);
  const filteredResults = results.filter(
    (user) =>
      query.trim().length >= 2 &&
      resultQuery === query.trim() &&
      !selectedIds.has(user.id) &&
      !excludedIds.has(user.id),
  );

  const addUser = (user: SearchUser) => {
    onChange([...value, { user, role: "MEMBER" }]);
    setQuery("");
    setResults([]);
    setIsOpen(false);
  };

  const removeUser = (userId: string) => {
    onChange(value.filter((member) => member.user.id !== userId));
  };

  const updateRole = (
    userId: string,
    role: Exclude<ProjectMemberRole, "OWNER">,
  ) => {
    onChange(
      value.map((member) =>
        member.user.id === userId ? { ...member, role } : member,
      ),
    );
  };

  return (
    <div className="space-y-3">
      <div ref={rootRef} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary/35" />
        <input
          id={generatedId}
          value={query}
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (disabled) return;
            setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-glass bg-glass-button/75 py-2.5 pl-10 pr-4 text-sm text-primary outline-none transition-all duration-200 placeholder:text-primary/40 focus:border-accent/60 focus:bg-glass-button focus:shadow-[0_0_15px_rgba(230,106,23,0.15)] disabled:cursor-not-allowed disabled:opacity-60"
        />

        {isOpen && !disabled && query.trim().length > 0 && (
          <div
            ref={menuRef}
            role="listbox"
            aria-labelledby={generatedId}
            className="absolute left-0 right-0 top-full z-80 mt-2 max-h-56 overflow-y-auto rounded-xl border border-glass bg-sidebar p-1.5 shadow-xl shadow-black/50 backdrop-blur-2xl animate-in fade-in slide-in-from-top-2"
          >
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-primary/50">
                <Loader2 className="size-4 animate-spin" />
                Searching...
              </div>
            ) : filteredResults.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-primary/45">
                {query.trim().length < 2 ? "Type at least 2 characters." : "No users found."}
              </p>
            ) : (
              filteredResults.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => addUser(user)}
                  className="mt-0.5 flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-accent/10"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-glass bg-glass-button text-[10px] font-semibold text-primary">
                      {user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.avatarUrl}
                          alt={user.fullName}
                          className="size-full object-cover"
                        />
                      ) : (
                        user.fullName.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                    <UserProfileLink
                      userId={user.id}
                      className="block truncate font-medium text-primary"
                      title={`View ${user.fullName}`}
                    >
                      {user.fullName}
                    </UserProfileLink>
                      <p className="truncate text-xs text-primary/50">{user.email}</p>
                    </div>
                  </div>
                  <Check className="size-4 shrink-0 text-accent/0" />
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((member) => (
            <li
              key={member.user.id}
              className="flex items-center gap-3 rounded-xl border border-glass bg-glass-button/40 px-3 py-2.5"
            >
              <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-glass bg-glass-button text-[10px] font-semibold text-primary">
                {member.user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={member.user.avatarUrl}
                    alt={member.user.fullName}
                    className="size-full object-cover"
                  />
                ) : (
                  member.user.fullName.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <UserProfileLink
                  userId={member.user.id}
                  className="block truncate text-sm font-medium text-primary"
                  title={`View ${member.user.fullName}`}
                >
                  {member.user.fullName}
                </UserProfileLink>
                <p className="truncate text-xs text-primary/45">
                  {member.user.email}
                </p>
              </div>
              <Select
                value={member.role}
                onChange={(role) =>
                  updateRole(
                    member.user.id,
                    role as Exclude<ProjectMemberRole, "OWNER">,
                  )
                }
                options={MEMBER_ROLE_OPTIONS}
                variant="compact"
                className="w-28 shrink-0"
                aria-label="Project role"
                disabled={disabled}
              />
              <button
                type="button"
                onClick={() => removeUser(member.user.id)}
                disabled={disabled}
                aria-label={`Remove ${member.user.fullName}`}
                className={cn(
                  "shrink-0 rounded-lg p-1.5 text-primary/35 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40",
                )}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
