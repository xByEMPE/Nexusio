import type { Metadata } from "next";
import { CompanyPageView } from "@/components/views/CompanyPageView";
import { companyMetadata } from "@/i18n/metadata";

export const metadata: Metadata = companyMetadata("es", "contact");

export default function Page() {
  return <CompanyPageView locale="es" page="contact" />;
}
