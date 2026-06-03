"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
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

type PasswordInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  variant?: FieldVariant;
};

export function PasswordInput({
  variant = "glass",
  className,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        className={cn(inputVariants[variant], "pr-10", className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-primary/40 transition hover:text-primary/70"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? (
          <EyeOff className="size-4" />
        ) : (
          <Eye className="size-4" />
        )}
      </button>
    </div>
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
