import AdminShellRouter from "@/components/layout/AdminShellRouter";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShellRouter>{children}</AdminShellRouter>;
}
