import type { Metadata } from "next";
import { CompanyPageView } from "@/components/views/CompanyPageView";
import { companyMetadata } from "@/i18n/metadata";

export const metadata: Metadata = companyMetadata("en", "about");

export default function Page() {
  return <CompanyPageView locale="en" page="about" />;
}
