import { GlassCard } from "@/components/ui/GlassCard";
import { Skeleton } from "@/components/ui/Skeleton";

function AdminPageHeaderSkeleton() {
  return (
    <div>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-72" />
    </div>
  );
}

function AdminMetricGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-glass-card bg-glass-card p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

function AdminTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-28" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 border-t border-glass pt-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

function AdminToggleListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex items-start justify-between gap-4 rounded-xl border border-glass bg-glass-button/40 px-4 py-3"
        >
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="mt-1 size-4 rounded" />
        </div>
      ))}
    </div>
  );
}

export function AdminShellSkeleton() {
  return (
    <div className="min-h-dvh bg-main">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-glass bg-sidebar px-4 py-6 md:flex md:flex-col">
        <div className="mb-8 flex items-center gap-2 px-2">
          <Skeleton className="size-5 rounded" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-xl" />
          ))}
        </div>
      </aside>
      <div className="md:pl-60">
        <div className="flex items-center justify-end gap-3 border-b border-glass px-4 py-3 md:px-8">
          <Skeleton className="size-10 rounded-xl" />
          <Skeleton className="size-10 rounded-xl" />
          <div className="flex items-center gap-3 px-2">
            <div className="hidden space-y-1 sm:block">
              <Skeleton className="ml-auto h-4 w-24" />
              <Skeleton className="ml-auto h-3 w-16" />
            </div>
            <Skeleton className="size-9 rounded-full" />
          </div>
        </div>
        <div className="p-6 md:p-8">
          <AdminOverviewSkeleton />
        </div>
      </div>
    </div>
  );
}

export function AdminOverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeaderSkeleton />
      <AdminMetricGridSkeleton />
      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard title="Controls">
          <AdminToggleListSkeleton />
        </GlassCard>
        <div className="flex flex-col gap-6">
          <GlassCard title="Signup funnel">
            <AdminMetricGridSkeleton count={3} />
          </GlassCard>
          <GlassCard title="Integrations">
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

export function AdminUsersSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeaderSkeleton />
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1 rounded-xl" />
        <Skeleton className="h-10 w-20 rounded-xl" />
      </div>
      <GlassCard>
        <AdminTableSkeleton rows={8} />
      </GlassCard>
    </div>
  );
}

export function AdminUserDrawerSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-56" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-24 rounded-xl" />
        <Skeleton className="h-9 w-28 rounded-xl" />
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>
    </div>
  );
}

export function AdminDemoSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeaderSkeleton />
      <AdminMetricGridSkeleton count={4} />
      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard title="Blocked actions (7 days)">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-10" />
              </div>
            ))}
          </div>
        </GlassCard>
        <GlassCard title="Daily summaries">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-36" />
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
      <GlassCard title="Recent sessions">
        <AdminTableSkeleton rows={5} />
      </GlassCard>
    </div>
  );
}

export function AdminSupportSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeaderSkeleton />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-36 rounded-xl" />
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard title="Tickets">
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        </GlassCard>
        <GlassCard title="Conversation">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-3 h-4 w-40" />
          <Skeleton className="mt-4 h-24 w-full rounded-xl" />
          <Skeleton className="mt-4 h-28 w-full rounded-xl" />
        </GlassCard>
      </div>
    </div>
  );
}

export function AdminBroadcastsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeaderSkeleton />
      <GlassCard title="Composer">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
      </GlassCard>
      <GlassCard title="Delivery log">
        <AdminTableSkeleton rows={5} />
      </GlassCard>
    </div>
  );
}

export function AdminAiSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeaderSkeleton />
      <AdminMetricGridSkeleton count={3} />
      <GlassCard title="Kill switch">
        <AdminToggleListSkeleton count={1} />
      </GlassCard>
      <GlassCard title="Per-user quota override">
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 w-24 rounded-xl" />
          <Skeleton className="h-10 w-16 rounded-xl" />
        </div>
      </GlassCard>
    </div>
  );
}

export function AdminAuditSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeaderSkeleton />
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1 rounded-xl" />
        <Skeleton className="h-10 w-20 rounded-xl" />
      </div>
      <GlassCard>
        <AdminTableSkeleton rows={8} />
      </GlassCard>
    </div>
  );
}
