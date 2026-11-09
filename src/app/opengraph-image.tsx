import { renderOgImage, OG_SIZE } from "@/lib/og/render";

export const alt = "NEXUS · Apps para drones DJI y software de inspección";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpengraphImage() {
  return renderOgImage({
    title: "Apps para drones DJI y software de inspección",
    subtitle: "Desarrollo a la medida en México · nexusio.com.mx",
  });
}
