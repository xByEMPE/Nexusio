import { describe, expect, it } from "vitest";
import { imageToScreen, radiusAtRow, rulerTicks, screenToImage } from "@/lib/blade";
import {
  addVertex,
  addMeasurePoint,
  cancelApplies,
  constrainTransform,
  addDistancePoint,
  distanceReadout,
  rulerInsets,
  nextViewMode,
  sameTransform,
  MAX_ORIGINAL_ATTEMPTS,
  shouldRequestOriginal,
  crosshairText,
  fitTransform,
  frameFor,
  groupInt,
  keyAction,
  measureReadout,
  navigationList,
  needsOriginal,
  neighbors,
  panTransform,
  scaleStatus,
  toViewState,
  zoomAt,
} from "./viewer-logic";

const container = { w: 800, h: 600 };
const image = { w: 5280, h: 3956 };

describe("fitTransform", () => {
  const leftTop = (t: ReturnType<typeof fitTransform>, c = container, img = image) => {
    const v = toViewState(t, c, img);
    const a = imageToScreen({ x: 0, y: 0 }, v);
    const b = imageToScreen({ x: img.w, y: img.h }, v);
    return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
  };
  it("llena el alto (o el ancho, si limita) sin margen y queda pegada a la izquierda", () => {
    const t = fitTransform(container, image, 0);
    expect(t.zoom).toBeCloseTo(Math.min(800 / 5280, 600 / 3956));
    const e = leftTop(t);
    expect(e.left).toBeCloseTo(0);
    expect(e.top).toBeCloseTo(0);
    // Foto vertical en contenedor apaisado: llena el alto, pegada a la izquierda.
    const tall = { w: 3000, h: 6000 };
    const e2 = leftTop(fitTransform(container, tall, 0), container, tall);
    expect(e2).toMatchObject({ left: expect.closeTo(0), top: expect.closeTo(0), bottom: expect.closeTo(600), right: expect.closeTo(300) });
  });
  it("con 90° usa las medidas intercambiadas", () => {
    const t = fitTransform(container, image, 90);
    expect(t.zoom).toBeCloseTo(Math.min(800 / 3956, 600 / 5280));
    expect(leftTop(t).left).toBeCloseTo(0);
    expect(leftTop(t).top).toBeCloseTo(0);
  });
  it("deja libres los márgenes de las reglas", () => {
    const tall = { w: 3000, h: 6000 };
    const t = fitTransform(container, tall, 0, { left: 64, bottom: 30 });
    expect(t.zoom).toBeCloseTo(570 / 6000);
    const e = leftTop(t, container, tall);
    expect(e.left).toBeCloseTo(64);
    expect(e.bottom).toBeCloseTo(570);
  });
  it("normaliza el ángulo", () => {
    expect(fitTransform(container, image, -90).rotationDeg).toBe(270);
    expect(fitTransform(container, image, 450).rotationDeg).toBe(90);
  });
  it("en un celular el ajuste puede quedar por debajo de MIN_ZOOM", () => {
    expect(fitTransform({ w: 360, h: 400 }, image, 0).zoom).toBeCloseTo(360 / 5280);
  });
  it("contenedor sin medir o más chico que las reglas: zoom 1 sin desplazamiento", () => {
    expect(fitTransform({ w: 0, h: 0 }, image, 0)).toEqual({ zoom: 1, panX: 0, panY: 0, rotationDeg: 0 });
    expect(fitTransform({ w: 50, h: 600 }, image, 90, { left: 64, bottom: 30 })).toEqual({ zoom: 1, panX: 0, panY: 0, rotationDeg: 90 });
  });
});

describe("constrainTransform (vista fija)", () => {
  const fit = fitTransform(container, image, 0);
  it("en el zoom de ajuste no se puede desplazar", () => {
    const moved = constrainTransform(panTransform(fit, 120, -80), container, image);
    expect(moved.panX).toBeCloseTo(fit.panX);
    expect(moved.panY).toBeCloseTo(fit.panY);
  });
  it("no deja alejar por debajo del ajuste", () => {
    const out = constrainTransform(zoomAt(fit, container, 0.5, { x: 700, y: 500 }), container, image);
    expect(out.zoom).toBeCloseTo(fit.zoom);
    expect(out.panX).toBeCloseTo(fit.panX);
    expect(out.panY).toBeCloseTo(fit.panY);
  });
  it("con zoom se desplaza sin huecos y el zoom hacia el cursor se respeta dentro de los límites", () => {
    const z = constrainTransform(zoomAt(fit, container, 3, { x: 200, y: 300 }), container, image);
    expect(z.zoom).toBeCloseTo(fit.zoom * 3);
    const v = toViewState(z, container, image);
    const before = screenToImage({ x: 200, y: 300 }, toViewState(fit, container, image));
    const after = imageToScreen(before, v);
    expect(after.x).toBeCloseTo(200);
    expect(after.y).toBeCloseTo(300);
    for (const [dx, dy] of [[5000, 5000], [-5000, -5000]] as const) {
      const p = toViewState(constrainTransform(panTransform(z, dx, dy), container, image), container, image);
      const a = imageToScreen({ x: 0, y: 0 }, p);
      const b = imageToScreen({ x: image.w, y: image.h }, p);
      expect(a.x).toBeLessThanOrEqual(1e-6);
      expect(a.y).toBeLessThanOrEqual(1e-6);
      expect(b.x).toBeGreaterThanOrEqual(800 - 1e-6);
      expect(b.y).toBeGreaterThanOrEqual(600 - 1e-6);
    }
  });
  it("con giro limita el encuadre girado", () => {
    const r = fitTransform(container, image, 90);
    const moved = constrainTransform(panTransform(r, 300, 300), container, image);
    expect(moved.panX).toBeCloseTo(r.panX);
    expect(moved.panY).toBeCloseTo(r.panY);
  });
  it("contenedor sin medir: no cambia nada", () => {
    const t = { zoom: 2, panX: 5, panY: 6, rotationDeg: 0 };
    expect(constrainTransform(t, { w: 0, h: 0 }, image)).toEqual(t);
  });
});

describe("nextViewMode", () => {
  const fit = fitTransform(container, image, 0);
  it("un gesto que deja la vista igual que el ajuste vuelve al modo ajustado", () => {
    const dragged = constrainTransform(panTransform(fit, 200, 150), container, image);
    expect(nextViewMode(dragged, fit)).toEqual({ kind: "fit", rotationDeg: 0 });
    const zoomedOut = constrainTransform(zoomAt(fit, container, 0.5, { x: 600, y: 400 }), container, image);
    expect(nextViewMode(zoomedOut, fit)).toEqual({ kind: "fit", rotationDeg: 0 });
    const r = fitTransform(container, image, 270);
    expect(nextViewMode({ ...r, panX: r.panX + 1e-9, rotationDeg: -90 }, r)).toEqual({ kind: "fit", rotationDeg: 270 });
  });
  it("con zoom o desplazamiento real queda en manual", () => {
    const z = constrainTransform(zoomAt(fit, container, 2), container, image);
    expect(nextViewMode(z, fit)).toEqual({ kind: "manual", t: z });
    const moved = constrainTransform(panTransform(z, -40, 0), container, image);
    expect(nextViewMode(moved, fit).kind).toBe("manual");
  });
  it("sameTransform tolera el error numérico pero no un giro distinto", () => {
    expect(sameTransform(fit, { ...fit, zoom: fit.zoom * (1 + 1e-9) })).toBe(true);
    expect(sameTransform(fit, { ...fit, panX: fit.panX + 0.5 })).toBe(false);
    expect(sameTransform(fit, { ...fit, rotationDeg: 90 })).toBe(false);
  });
});

describe("rulerInsets", () => {
  it("márgenes solo para las reglas visibles", () => {
    expect(rulerInsets({ ruler: true, bottomRuler: true }, true, 64, 30)).toEqual({ left: 64, bottom: 30 });
    expect(rulerInsets({ ruler: false, bottomRuler: true }, true, 64, 30)).toEqual({ left: 0, bottom: 30 });
    expect(rulerInsets({ ruler: true, bottomRuler: true }, false, 64, 30)).toEqual({ left: 0, bottom: 0 });
  });
});

describe("medir distancia", () => {
  it("2 clics dan el segmento; un 2.º clic casi encima del 1.º se ignora", () => {
    const one = addDistancePoint([], { x: 10, y: 10 }, 4);
    expect(one).toEqual({ points: [{ x: 10, y: 10 }], segment: null });
    expect(addDistancePoint(one.points, { x: 12, y: 11 }, 4)).toEqual({ points: [{ x: 10, y: 10 }], segment: null });
    expect(addDistancePoint(one.points, { x: 10, y: 110 }, 4)).toEqual({ points: [], segment: [{ x: 10, y: 10 }, { x: 10, y: 110 }] });
  });
  it("lectura en mm con tipo; null sin GSD", () => {
    expect(distanceReadout({ x: 0, y: 0 }, { x: 0, y: 100 }, 2)).toEqual({ distance_mm: 200, kind: "longitudinal" });
    expect(distanceReadout({ x: 0, y: 0 }, { x: 100, y: 0 }, 2)?.kind).toBe("transversal");
    expect(distanceReadout({ x: 0, y: 0 }, { x: 100, y: 100 }, 2)?.kind).toBe("diagonal");
    expect(distanceReadout({ x: 0, y: 0 }, { x: 0, y: 100 }, null)).toBeNull();
    expect(distanceReadout({ x: 0, y: 0 }, { x: 0, y: 100 }, 0)).toBeNull();
  });
});

describe("zoomAt", () => {
  it("mantiene fijo el punto de la imagen bajo el cursor, también girada", () => {
    for (const rot of [0, 90, 37]) {
      const t = { zoom: 0.3, panX: 25, panY: -40, rotationDeg: rot };
      const at = { x: 610, y: 120 };
      const before = screenToImage(at, toViewState(t, container, image));
      const z = zoomAt(t, container, 1.15, at);
      expect(z.zoom).toBeCloseTo(0.345);
      const after = imageToScreen(before, toViewState(z, container, image));
      expect(after.x).toBeCloseTo(at.x);
      expect(after.y).toBeCloseTo(at.y);
    }
  });
  it("sin punto, centra en el contenedor y respeta los límites", () => {
    const z = zoomAt({ zoom: 9, panX: 0, panY: 0, rotationDeg: 0 }, container, 2);
    expect(z.zoom).toBe(10);
    expect(z.panX).toBe(0);
    expect(zoomAt({ zoom: 0.11, panX: 0, panY: 0, rotationDeg: 0 }, container, 0.5).zoom).toBe(0.1);
  });
  it("por debajo de MIN_ZOOM (ajuste en celular) no salta al acercar ni baja más al alejar", () => {
    const t = { zoom: 0.06, panX: 0, panY: 0, rotationDeg: 0 };
    expect(zoomAt(t, container, 1.15).zoom).toBeCloseTo(0.069);
    expect(zoomAt(t, container, 1 / 1.15).zoom).toBe(0.06);
  });
  it("panTransform suma el desplazamiento", () => {
    expect(panTransform({ zoom: 1, panX: 1, panY: 2, rotationDeg: 0 }, 3, -4)).toMatchObject({ panX: 4, panY: -2 });
  });
});

describe("needsOriginal", () => {
  it("cambia al original cuando un pixel de la vista previa ocupa más de un pixel de pantalla", () => {
    // 5280 → 2560: umbral en zoom = 2560/5280 ≈ 0.485
    expect(needsOriginal(0.48, 2560, 5280)).toBe(false);
    expect(needsOriginal(0.49, 2560, 5280)).toBe(true);
  });
  it("sin vista previa medida o con vista previa a resolución completa no pide el original", () => {
    expect(needsOriginal(5, null, 5280)).toBe(false);
    expect(needsOriginal(5, 640, 640)).toBe(false);
  });
});

const caps = [
  { id: "a-te-1", blade: "A" },
  { id: "b-te-1", blade: "B" },
  { id: "a-te-2", blade: "A" },
  { id: "a-ps-1", blade: "A" },
  { id: "b-ps-1", blade: "B" },
];

describe("navegación", () => {
  it("recorre solo la pala de la foto actual, en el orden dado", () => {
    expect(navigationList(caps, "a-te-2").map((c) => c.id)).toEqual(["a-te-1", "a-te-2", "a-ps-1"]);
  });
  it("vecinas y extremos", () => {
    expect(neighbors(caps, "a-te-2")).toMatchObject({ prev: { id: "a-te-1" }, next: { id: "a-ps-1" }, index: 1, total: 3 });
    expect(neighbors(caps, "a-te-1").prev).toBeNull();
    expect(neighbors(caps, "b-ps-1").next).toBeNull();
    expect(neighbors(caps, "x")).toMatchObject({ prev: null, next: null, index: -1 });
  });
});

describe("scaleStatus", () => {
  const full = { gsd_mm_px: 0.97, radius_center_m: 20, gsd_confidence: "high" as const };
  it("con GSD y radio: regla salvo si está girada", () => {
    expect(scaleStatus(full, 0)).toMatchObject({ bottomRuler: true, ruler: true, canMeasure: true, hasRadius: true, estimated: false, noScale: false });
    expect(scaleStatus(full, 90).ruler).toBe(false);
    expect(scaleStatus(full, 90).bottomRuler).toBe(false);
    expect(scaleStatus(full, 360).ruler).toBe(true);
    expect(scaleStatus(full, 90).hasRadius).toBe(true);
  });
  it("confianza baja: escala estimada", () => {
    expect(scaleStatus({ ...full, gsd_confidence: "low" }, 0).estimated).toBe(true);
  });
  it("sin GSD: sin escala, sin regla ni medición", () => {
    expect(scaleStatus({ ...full, gsd_mm_px: null }, 0)).toMatchObject({ noScale: true, bottomRuler: false, ruler: false, canMeasure: false, hasRadius: false });
  });
  it("GSD sin radio: se mide, pero sin regla ni radio", () => {
    expect(scaleStatus({ ...full, radius_center_m: null }, 0)).toMatchObject({ canMeasure: true, ruler: false, bottomRuler: true, hasRadius: false, noScale: false });
  });
});

describe("crosshair y regla", () => {
  const cap = { gsd_mm_px: 1, radius_center_m: 20, gsd_confidence: "high" as const, height_px: 4000 };
  it("frameFor exige GSD y radio", () => {
    expect(frameFor(cap, true)).toEqual({ rc_m: 20, gsd_mm_px: 1, height_px: 4000, tipAtTop: true });
    expect(frameFor({ ...cap, radius_center_m: null }, true)).toBeNull();
  });
  it("texto con miles separados", () => {
    const f = frameFor(cap, true)!;
    expect(crosshairText({ x: 10, y: 2000 }, f)).toBe("R: 20 000 mm");
    // punta arriba: más arriba, más radio
    expect(crosshairText({ x: 10, y: 1655 }, f)).toBe("R: 20 345 mm");
    expect(crosshairText({ x: 10.4, y: 99.6 }, null)).toBe("x 10 · y 100 px");
  });
  it("el crosshair en la fila de una marca da el mismo valor que la etiqueta de la regla", () => {
    const f = frameFor(cap, true)!;
    const v = toViewState({ zoom: 0.4, panX: 12, panY: -33, rotationDeg: 0 }, container, { w: 5280, h: 4000 });
    const ticks = rulerTicks(v, f);
    expect(ticks.length).toBeGreaterThan(2);
    for (const t of ticks) {
      const img = screenToImage({ x: 300, y: t.y }, v);
      expect(Math.round(radiusAtRow(img.y, f) * 1000)).toBe(Number(t.label));
    }
    // y la regla sube hacia la punta: marcas más altas en pantalla, radio mayor
    const sorted = [...ticks].sort((a, b) => a.y - b.y);
    expect(sorted[0]!.r_m).toBeGreaterThan(sorted[sorted.length - 1]!.r_m);
  });
  it("groupInt", () => {
    expect(groupInt(999)).toBe("999");
    expect(groupInt(1234567)).toBe("1 234 567");
    expect(groupInt(-1500)).toBe("−1 500");
    expect(groupInt(-0.2)).toBe("0");
  });
});

describe("medir área", () => {
  it("con el 3.er punto se completa el rectángulo y se vacían los puntos", () => {
    let st = addMeasurePoint([], { x: 0, y: 0 }, 3);
    expect(st.corners).toBeNull();
    st = addMeasurePoint(st.points, { x: 0, y: 40 }, 3);
    expect(st.points).toHaveLength(2);
    st = addMeasurePoint(st.points, { x: 10, y: 25 }, 3);
    expect(st.points).toEqual([]);
    expect(st.corners).toEqual([{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 10, y: 40 }, { x: 10, y: 0 }]);
    expect(measureReadout(st.corners!, 0.5)).toEqual({ longitudinal_mm: 20, transversal_mm: 5, area_mm2: 100 });
  });
  it("un 3.er punto casi sobre la recta 1–2 se ignora (no hay medición sin área)", () => {
    const two = [{ x: 0, y: 0 }, { x: 0, y: 40 }];
    const st = addMeasurePoint(two, { x: 2, y: 60 }, 3);
    expect(st.corners).toBeNull();
    expect(st.points).toEqual(two);
    expect(addMeasurePoint(two, { x: 3, y: 60 }, 3).corners).not.toBeNull();
  });
  it("un punto repetido no cuenta", () => {
    const st = addMeasurePoint([{ x: 1, y: 1 }], { x: 2, y: 2 }, 3);
    expect(st.points).toHaveLength(1);
    expect(st.corners).toBeNull();
  });
  it("sin GSD no hay medidas", () => {
    expect(measureReadout([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], null)).toBeNull();
  });
  it("addVertex descarta el punto repetido del doble clic", () => {
    const p = addVertex([], { x: 1, y: 1 }, 3);
    expect(addVertex(p, { x: 2, y: 2 }, 3)).toHaveLength(1);
    expect(addVertex(p, { x: 10, y: 1 }, 3)).toHaveLength(2);
  });
});

describe("keyAction", () => {
  it("mapea las teclas del visor", () => {
    expect(keyAction("ArrowLeft")).toBe("prev");
    expect(keyAction("ArrowRight")).toBe("next");
    expect(keyAction("+")).toBe("zoomIn");
    expect(keyAction("-")).toBe("zoomOut");
    expect(keyAction("0")).toBe("fit");
    expect(keyAction("Escape")).toBe("cancel");
    expect(keyAction("a")).toBeNull();
  });
});

describe("reintento del original", () => {
  const base = { want: true, cached: false, inFlight: false, attempts: 0 };
  it("pide la primera vez y reintenta una sola vez tras un fallo", () => {
    expect(shouldRequestOriginal(base)).toBe(true);
    expect(shouldRequestOriginal({ ...base, attempts: 1 })).toBe(true);
    expect(shouldRequestOriginal({ ...base, attempts: MAX_ORIGINAL_ATTEMPTS })).toBe(false);
  });
  it("no pide si no hace falta, ya está en caché o hay una petición en curso", () => {
    expect(shouldRequestOriginal({ ...base, want: false })).toBe(false);
    expect(shouldRequestOriginal({ ...base, cached: true })).toBe(false);
    expect(shouldRequestOriginal({ ...base, inFlight: true })).toBe(false);
  });
});

describe("cancelApplies", () => {
  it("Esc solo con herramienta o borrador activos", () => {
    expect(cancelApplies("move", false)).toBe(false);
    expect(cancelApplies("move", true)).toBe(true);
    expect(cancelApplies("crosshair", false)).toBe(true);
    expect(cancelApplies("area", false)).toBe(true);
    expect(cancelApplies("distance", false)).toBe(true);
  });
});
