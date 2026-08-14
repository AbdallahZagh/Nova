"use client";

import { useState } from "react";
import { Header } from "@/components/ui/Header";
import { Sidebar } from "@/components/ui/Sidebar";
import { OfflineBanner } from "@/components/offline/OfflineBanner";
import { DemoTourModal } from "@/components/demo/DemoTourModal";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-main text-primary">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      {/* Main column: fills viewport to the right of the sidebar */}
      <div className="fixed inset-y-0 left-0 right-0 z-20 md:left-64">
        <Header
          onMenuClick={() => setMobileOpen(true)}
          searchOpen={searchOpen}
          onSearchOpenChange={setSearchOpen}
        />
        <main className="mt-16 h-[calc(100dvh-4rem)] overflow-y-auto">
          <OfflineBanner />
          <div className="p-6 md:p-8">{children}</div>
        </main>
        <DemoTourModal />
      </div>
    </div>
  );
}
