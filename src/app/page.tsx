import { Hero } from "@/components/sections/Hero";
import { Services } from "@/components/sections/Services";
import { AppShowcase } from "@/components/sections/AppShowcase";
import { ClientPortal } from "@/components/sections/ClientPortal";
import { About } from "@/components/sections/About";
import { HowWeWork } from "@/components/sections/HowWeWork";
import { AssessmentSection } from "@/components/sections/AssessmentSection";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Services />
      <AppShowcase />
      <ClientPortal />
      <About />
      <HowWeWork />
      <AssessmentSection />
    </>
  );
}
