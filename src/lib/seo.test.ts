import { describe, expect, it } from "vitest";
import { ORG_ID, SOCIAL_PROFILES, organizationNode, sameAsProps, socialLabel } from "./seo";

const base = { description: "d", knowsAbout: ["a", "b"] };

describe("organizationNode", () => {
  it("con lista vacía no incluye sameAs", () => {
    const n = organizationNode({ ...base, profiles: [] });
    expect("sameAs" in n).toBe(false);
    expect(JSON.stringify(n)).not.toContain("sameAs");
  });
  it("con 2 URLs emite sameAs", () => {
    const urls = ["https://www.linkedin.com/company/1/", "https://x.com/nexus"];
    expect(organizationNode({ ...base, profiles: urls })).toMatchObject({ sameAs: urls });
    expect(sameAsProps(urls)).toEqual({ sameAs: urls });
    expect(sameAsProps([])).toEqual({});
  });
  it("usa por defecto el perfil de LinkedIn de la empresa", () => {
    expect(SOCIAL_PROFILES).toEqual(["https://www.linkedin.com/company/144116199/"]);
    expect(organizationNode(base)).toMatchObject({ sameAs: [...SOCIAL_PROFILES] });
    expect(socialLabel(SOCIAL_PROFILES[0]!)).toBe("LinkedIn");
  });
  it("tiene @id estable, logo ImageObject absoluto, contactPoint y área", () => {
    const n = organizationNode(base);
    expect(n["@id"]).toBe(ORG_ID);
    expect(n.logo["@type"]).toBe("ImageObject");
    expect(n.logo.url).toMatch(/^https?:\/\//);
    expect(n.areaServed).toEqual({ "@type": "Country", name: "México" });
    expect(n.contactPoint.availableLanguage).toEqual(["es", "en"]);
    expect("legalName" in n).toBe(false);
  });
});
