import { renderOgImage, OG_SIZE } from "@/lib/og/render";

export const alt = "NEXUS · DJI drone apps and inspection software";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpengraphImage() {
  return renderOgImage({
    title: "Apps for DJI drones and inspection software",
    subtitle: "Custom development · nexusio.com.mx",
  });
}
