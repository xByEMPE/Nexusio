import { AdminHeader } from "@/components/admin/AdminHeader";
import { InspectionsNav } from "@/components/inspections/admin/InspectionsNav";
import { requireStaff } from "@/lib/auth/viewer";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";

export const dynamic = "force-dynamic";

export default async function InspectionsAdminLayout({ children }: { children: React.ReactNode }) {
  assertInspectionsEnabled();
  const viewer = await requireStaff();
  return (
    <>
      <AdminHeader email={viewer.user.email} />
      <InspectionsNav />
      <main className="container py-8 md:py-10">{children}</main>
    </>
  );
}
