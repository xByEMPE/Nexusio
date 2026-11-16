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
      <main className="w-full px-4 py-6 md:px-6 md:py-8">{children}</main>
    </>
  );
}
