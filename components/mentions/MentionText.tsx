"use client";

import { splitMentionText } from "@/lib/mentions";
import { cn } from "@/lib/cn";

export function MentionText({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {splitMentionText(content).map((part, index) =>
        part.mention ? (
          <span key={`${part.text}-${index}`} className="font-semibold text-accent">
            {part.text}
          </span>
        ) : (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        ),
      )}
    </span>
  );
}
