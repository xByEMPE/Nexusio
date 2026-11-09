import type { Metadata } from "next";
import { ServicePageView } from "@/components/views/ServicePageView";
import { SERVICE_SLUGS } from "@/i18n/routes";
import { serviceMetadata } from "@/i18n/metadata";

export const dynamicParams = false;

export function generateStaticParams() {
  return SERVICE_SLUGS.map((s) => ({ slug: s.es }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return serviceMetadata("es", (await params).slug);
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  return <ServicePageView locale="es" slug={(await params).slug} />;
}
