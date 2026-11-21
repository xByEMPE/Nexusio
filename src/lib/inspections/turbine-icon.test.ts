import { describe, expect, it } from "vitest";
import { HEALTH_META, HEALTH_ORDER } from "./map";
import { turbineSvg } from "./turbine-icon";

describe("turbineSvg", () => {
  it.each(HEALTH_ORDER)("%s usa su color, tres aspas y es decorativo", (h) => {
    const svg = turbineSvg(h);
    expect(svg).toContain(HEALTH_META[h].color);
    expect(svg.match(/rotate\(/g)).toHaveLength(3);
    expect(svg).toContain('aria-hidden="true"');
  });
  it("el crítico parpadea y el moderado pulsa", () => {
    expect(turbineSvg("critical")).toContain("animate-signal-blink");
    expect(turbineSvg("moderate")).toContain("animate-signal-pulse");
    expect(turbineSvg("moderate")).not.toContain("animate-signal-blink");
  });
  it("sin inspección no se anima ni gira y su anillo es punteado", () => {
    const svg = turbineSvg("none");
    expect(svg).not.toContain("animate-");
    expect(svg).toContain("stroke-dasharray");
  });
  it("con inspección las aspas giran", () => expect(turbineSvg("ok")).toContain("animate-rotor-spin-slow"));
});
