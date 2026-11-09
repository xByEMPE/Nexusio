import { RootShell } from "@/components/layout/RootShell";
import { SiteChrome } from "@/components/layout/SiteChrome";
import { homeMetadata, sharedViewport } from "@/i18n/metadata";

export const metadata = homeMetadata("en");
export const viewport = sharedViewport;

/** Root layout for the English site (/en). */
export default function EnglishLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootShell lang="en">
      <SiteChrome locale="en">{children}</SiteChrome>
    </RootShell>
  );
}
