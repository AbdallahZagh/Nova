import { cn } from "@/lib/cn";

type GlassCardProps = {
  children: React.ReactNode;
  className?: string;
  title?: string;
};

export function GlassCard({ children, className, title }: GlassCardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-glass-card bg-glass-card p-6",
        className,
      )}
    >
      {title ? (
        <h2 className="mb-4 text-sm font-medium tracking-wide text-primary/70">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}
