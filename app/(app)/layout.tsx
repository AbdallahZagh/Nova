import { AppShell } from "@/components/layout/AppShell";
import { AppDataProvider } from "@/components/providers/AppDataProvider";
import { UserProvider } from "@/components/providers/UserProvider";
/** Shared shell (sidebar + header) for all authenticated routes. */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserProvider>
      <AppDataProvider>
        <AppShell>{children}</AppShell>
      </AppDataProvider>
    </UserProvider>
  );
}
