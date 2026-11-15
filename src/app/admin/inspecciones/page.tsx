import { redirect } from "next/navigation";
import { assertInspectionsEnabled } from "@/lib/inspections/flag";

export default function InspectionsIndexPage() {
  assertInspectionsEnabled();
  redirect("/admin/inspecciones/proyectos");
}
