"use client";

import { cn } from "@/lib/cn";
import { inputVariants, type FieldVariant } from "@/components/ui/fieldVariants";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  variant?: FieldVariant;
};

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  variant?: FieldVariant;
};

export function Input({
  variant = "glass",
  className,
  ...props
}: InputProps) {
  return (
    <input
      className={cn(inputVariants[variant], className)}
      {...props}
    />
  );
}

export function Textarea({
  variant = "glass",
  className,
  ...props
}: TextareaProps) {
  return (
    <textarea
      className={cn(inputVariants[variant], className)}
      {...props}
    />
  );
}
