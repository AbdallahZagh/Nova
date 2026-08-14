import { normalizeUsername } from './utils/username.util';

export type MentionCandidate = {
  id: string;
  username: string;
  fullName: string;
};

const MENTION_RE = /@[a-z0-9_]+/gi;

export function extractMentionUsernames(content: string): string[] {
  const matches = content.match(MENTION_RE) ?? [];
  return [...new Set(matches.map((value) => normalizeUsername(value)))];
}

export function resolveMentionedUsers(
  content: string,
  eligible: MentionCandidate[],
): MentionCandidate[] {
  const wanted = new Set(extractMentionUsernames(content));
  if (wanted.size === 0) return [];

  const byUsername = new Map(
    eligible
      .filter((user) => user.username)
      .map((user) => [normalizeUsername(user.username), user]),
  );

  return [...wanted]
    .map((username) => byUsername.get(username))
    .filter((user): user is MentionCandidate => Boolean(user));
}
