import { AppShell } from "@/components/layout/AppShell";
import { AppDataProvider } from "@/components/providers/AppDataProvider";
import { NotificationProvider } from "@/components/providers/NotificationProvider";
import { UserProvider } from "@/components/providers/UserProvider";
/** Shared shell (sidebar + header) for all authenticated routes. */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserProvider>
      <NotificationProvider>
        <AppDataProvider>
          <AppShell>{children}</AppShell>
        </AppDataProvider>
      </NotificationProvider>
    </UserProvider>
  );
}
