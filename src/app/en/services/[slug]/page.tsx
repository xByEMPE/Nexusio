import type { Metadata } from "next";
import { ServicePageView } from "@/components/views/ServicePageView";
import { SERVICE_SLUGS } from "@/i18n/routes";
import { serviceMetadata } from "@/i18n/metadata";

export const dynamicParams = false;

export function generateStaticParams() {
  return SERVICE_SLUGS.map((s) => ({ slug: s.en }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return serviceMetadata("en", (await params).slug);
}

export default async function EnglishServicePage({ params }: { params: Promise<{ slug: string }> }) {
  return <ServicePageView locale="en" slug={(await params).slug} />;
}
