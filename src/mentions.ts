export type MentionUser = {
  id: string;
  username: string;
  fullName: string;
};

const MENTION_RE = /@[a-z0-9_]+/gi;

export function normalizeMention(raw: string) {
  let value = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!value) return "";
  if (!value.startsWith("@")) value = `@${value}`;
  return value.replace(/[^@a-z0-9_]/g, "");
}

export function mentionQueryAtCaret(value: string, caret: number) {
  const before = value.slice(0, caret);
  const match = before.match(/(^|\s)@([a-z0-9_]*)$/i);
  if (!match) return null;
  return {
    query: match[2] ?? "",
    start: caret - (match[2]?.length ?? 0) - 1,
  };
}

export function insertMention(value: string, caret: number, username: string) {
  const handle = normalizeMention(username);
  const active = mentionQueryAtCaret(value, caret);
  if (!active) {
    const next = `${value}${value.endsWith(" ") || !value ? "" : " "}${handle} `;
    return { value: next, caret: next.length };
  }
  const next = `${value.slice(0, active.start)}${handle} ${value.slice(caret)}`;
  return { value: next, caret: active.start + handle.length + 1 };
}

export function filterMentionUsers(users: MentionUser[], query: string) {
  const q = query.trim().toLowerCase().replace(/^@/, "");
  return users
    .filter((user) => user.username)
    .filter((user) => {
      if (!q) return true;
      const username = user.username.toLowerCase().replace(/^@/, "");
      const name = user.fullName.toLowerCase();
      return username.includes(q) || name.includes(q);
    })
    .slice(0, 8);
}

export function findMentionUser(users: MentionUser[] | undefined, handle: string) {
  if (!users?.length) return undefined;
  const normalized = normalizeMention(handle);
  return users.find((user) => normalizeMention(user.username) === normalized);
}

export function splitMentionText(content: string) {
  const parts: { text: string; mention: boolean }[] = [];
  let last = 0;
  for (const match of content.matchAll(MENTION_RE)) {
    const start = match.index ?? 0;
    if (start > last) {
      parts.push({ text: content.slice(last, start), mention: false });
    }
    parts.push({ text: match[0], mention: true });
    last = start + match[0].length;
  }
  if (last < content.length) {
    parts.push({ text: content.slice(last), mention: false });
  }
  return parts.length ? parts : [{ text: content, mention: false }];
}

export function mentionUsersFromPeople(
  people: {
    id?: string;
    userId?: string;
    username?: string | null;
    fullName?: string | null;
    name?: string | null;
    email?: string | null;
  }[],
): MentionUser[] {
  const seen = new Set<string>();
  const users: MentionUser[] = [];
  for (const person of people) {
    const id = person.userId ?? person.id ?? "";
    const username = person.username ? normalizeMention(person.username) : "";
    if (!id || !username || seen.has(id)) continue;
    seen.add(id);
    users.push({
      id,
      username,
      fullName: person.fullName || person.name || person.email || username,
    });
  }
  return users;
}
