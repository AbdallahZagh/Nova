"use client";

import { useEffect, useRef } from "react";

type AutoTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
};

/** A textarea that grows with its text instead of scrolling inside itself. */
export function AutoTextarea({ value, ...props }: AutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return <textarea ref={ref} value={value} rows={1} {...props} />;
}
