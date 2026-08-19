import { UserProvider } from "@/components/providers/UserProvider";
import { NotificationProvider } from "@/components/providers/NotificationProvider";
import { AdminShell } from "@/components/admin/AdminShell";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserProvider>
      <NotificationProvider>
        <AdminShell>{children}</AdminShell>
      </NotificationProvider>
    </UserProvider>
  );
}
