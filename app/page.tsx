import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Taskflow — Sign in",
};

export default function LoginPage() {
  return (
    <div className="relative flex min-h-full flex-col items-center justify-center bg-main px-4 py-12 text-primary">
      <div className="absolute right-4 top-4 md:right-8 md:top-8">
        <ThemeToggle />
      </div>

      <div className="mb-8 text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-primary/50">
          Welcome back
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Taskflow</h1>
        <p className="mt-2 text-sm text-primary/60">
          Sign in to manage your workspace
        </p>
      </div>

      <GlassCard className="w-full max-w-md">
        <LoginForm />
        <p className="mt-4 text-center text-sm text-primary/55">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            Create one
          </Link>
        </p>
        <p className="mt-6 rounded-xl border border-glass bg-main/50 px-4 py-3 text-xs text-primary/60">
          <span className="font-medium text-primary">Demo credentials</span>
          <br />
          Email: {DEMO_EMAIL}
          <br />
          Password: {DEMO_PASSWORD}
        </p>
      </GlassCard>
    </div>
  );
}
