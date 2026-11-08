import { ImageResponse } from "next/og";

export const alt = "NEXUS · Apps para drones DJI y software de inspección";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Imagen que muestran WhatsApp, LinkedIn, Facebook y X al compartir el sitio. */
export default function OpengraphImage() {
  const rotors = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#000000",
          color: "#ffffff",
          padding: "72px 80px",
          fontFamily: "sans-serif",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 680 }}>
          <div style={{ fontSize: 22, letterSpacing: 8, color: "#a8a8a8" }}>SOFTWARE · AI · DRONES</div>
          <div style={{ marginTop: 28, fontSize: 64, fontWeight: 600, lineHeight: 1.08 }}>
            Apps para drones DJI y software de inspección
          </div>
          <div style={{ marginTop: 28, fontSize: 28, color: "#a8a8a8" }}>Desarrollo a la medida en México · nexusio.com.mx</div>
          <div style={{ marginTop: 40, fontSize: 40, letterSpacing: 18 }}>NEXUS</div>
          <div style={{ marginTop: 10, width: 240, height: 2, background: "#5f72a0" }} />
        </div>
        <div style={{ position: "relative", display: "flex", width: 340, height: 340 }}>
          <div
            style={{
              position: "absolute",
              left: 10,
              top: 10,
              width: 320,
              height: 320,
              borderRadius: 160,
              border: "3px solid #3b3b3b",
            }}
          />
          {[45, -45].map((deg) => (
            <div
              key={deg}
              style={{
                position: "absolute",
                left: 170 - 158,
                top: 170 - 3,
                width: 316,
                height: 6,
                background: "#ffffff",
                transform: `rotate(${deg}deg)`,
              }}
            />
          ))}
          {rotors.map(([x, y], i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 170 + x * 112 - 40,
                top: 170 + y * 112 - 40,
                width: 80,
                height: 80,
                borderRadius: 40,
                border: "6px solid #ffffff",
                background: "#000000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 22, border: "5px solid #2f7bfe", borderTopColor: "transparent", borderBottomColor: "transparent" }} />
            </div>
          ))}
          <div
            style={{
              position: "absolute",
              left: 170 - 30,
              top: 170 - 30,
              width: 60,
              height: 60,
              borderRadius: 30,
              border: "6px solid #ffffff",
              background: "#000000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: 24, height: 24, borderRadius: 12, background: "#2f7bfe" }} />
          </div>
        </div>
      </div>
    ),
    size,
  );
}
