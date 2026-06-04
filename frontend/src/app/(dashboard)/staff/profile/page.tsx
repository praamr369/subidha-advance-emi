"use client";

import StaffDataPage from "@/components/staff/StaffDataPage";
import { getStaffProfile, type StaffProfilePayload } from "@/services/staff";

export default function StaffProfilePage() {
  return (
    <StaffDataPage<StaffProfilePayload>
      title="My Profile"
      description="Your own HR identity, login ID, branch, department, and CRM party link if available."
      load={getStaffProfile}
      render={(data) => (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">Staff identity</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div><dt className="text-muted-foreground">Name</dt><dd className="font-semibold text-foreground">{data.profile.name}</dd></div>
              <div><dt className="text-muted-foreground">Employee code</dt><dd>{data.profile.employee_code}</dd></div>
              <div><dt className="text-muted-foreground">Username / Login ID</dt><dd>{data.user.username}</dd></div>
              <div><dt className="text-muted-foreground">Phone</dt><dd>{data.profile.phone || data.user.phone || "Not set"}</dd></div>
              <div><dt className="text-muted-foreground">Email</dt><dd>{data.user.email || "Not set"}</dd></div>
            </dl>
          </section>
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">Work profile</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div><dt className="text-muted-foreground">Designation</dt><dd>{data.profile.designation || "Not set"}</dd></div>
              <div><dt className="text-muted-foreground">Department</dt><dd>{data.profile.department || "Not set"}</dd></div>
              <div><dt className="text-muted-foreground">Branch</dt><dd>{data.profile.branch_name || "Default branch"}</dd></div>
              <div><dt className="text-muted-foreground">Joining date</dt><dd>{data.profile.joining_date || "Not set"}</dd></div>
              <div><dt className="text-muted-foreground">CRM party</dt><dd>{data.crm_party?.party_no || "Not linked"}</dd></div>
            </dl>
          </section>
        </div>
      )}
    />
  );
}
