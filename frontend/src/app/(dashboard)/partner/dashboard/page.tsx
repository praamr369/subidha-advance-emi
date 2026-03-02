import RoleGuard from "@/components/auth/RoleGuard";

export default function AdminDashboard() {
  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      {/* Dashboard UI */}
    </RoleGuard>
  );
}