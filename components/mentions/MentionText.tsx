"use client";

import { UserProfileLink } from "@/components/users/UserProfileLink";
import { findMentionUser, splitMentionText, type MentionUser } from "@/lib/mentions";
import { cn } from "@/lib/cn";

export function MentionText({
  content,
  users,
  className,
}: {
  content: string;
  users?: MentionUser[];
  className?: string;
}) {
  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {splitMentionText(content).map((part, index) => {
        if (!part.mention) {
          return <span key={`${part.text}-${index}`}>{part.text}</span>;
        }
        const user = findMentionUser(users, part.text);
        if (!user) {
          return (
            <span key={`${part.text}-${index}`} className="font-semibold text-accent">
              {part.text}
            </span>
          );
        }
        return (
          <UserProfileLink
            key={`${part.text}-${index}`}
            userId={user.id}
            title={`View ${user.fullName}`}
            className="font-semibold text-accent hover:underline"
          >
            {part.text}
          </UserProfileLink>
        );
      })}
    </span>
  );
}
