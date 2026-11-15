import type { OrgMemberRole, PlatformRole } from "@/lib/auth/viewer";

/** Qué puede hacer quien abre el visor (§4.6). Se calcula en el servidor; RLS sigue siendo el árbitro final. */
export type ViewerCapabilities = {
  editFindings: boolean;
  deleteFindings: boolean;
  comment: boolean;
  review: boolean;
  history: boolean;
};

type Who = { platformRole: PlatformRole | null; memberships: { organizationId: string; role: OrgMemberRole }[] };

const NONE: ViewerCapabilities = { editFindings: false, deleteFindings: false, comment: false, review: false, history: false };

/** Personal de NEXUS (admin o técnico). Con la inspección aprobada solo el admin edita. */
export function staffCapabilities(v: Who, approved: boolean): ViewerCapabilities {
  if (v.platformRole === "admin") return { editFindings: true, deleteFindings: true, comment: true, review: false, history: true };
  if (v.platformRole === "technician") return { editFindings: !approved, deleteFindings: false, comment: true, review: false, history: true };
  return NONE;
}

/** Cliente: el responsable de la organización del proyecto comenta y marca revisado; el lector solo mira. */
export function clientCapabilities(v: Who, organizationId: string): ViewerCapabilities {
  const manager = v.memberships.some((m) => m.organizationId === organizationId && m.role === "client_manager");
  return { ...NONE, comment: manager, review: manager };
}
