"""Proyectos, turbinas e inspección (RLS ya limita lo visible a las asignaciones del usuario)."""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from nexus_desktop.storage.local_index import LocalIndex

KIND = "wind_blade"


class InspectionLocked(Exception):
    """La inspección ya está aprobada y no admite más subidas."""


@dataclass
class Project:
    id: str
    name: str  # projects.name
    organization_id: str


@dataclass
class Asset:
    id: str
    name: str  # assets.name
    status_hint: str | None  # estado de la inspección del activo en el proyecto, si existe


def list_projects(client) -> list[Project]:
    rows = client.table("projects").select("id,name,organization_id").order("name").execute().data
    return [Project(r["id"], r["name"], r["organization_id"]) for r in rows or []]


def list_assets(client, project_id: str) -> list[Asset]:
    """Turbinas eólicas de los sitios del proyecto (project_sites -> assets)."""
    sites = client.table("project_sites").select("site_id").eq("project_id", project_id).execute().data
    site_ids = [r["site_id"] for r in sites or []]
    if not site_ids:
        return []
    assets = (client.table("assets").select("id,name").in_("site_id", site_ids)
              .eq("kind", "wind_turbine").order("name").execute().data)
    insp = (client.table("inspections").select("asset_id,status").eq("project_id", project_id)
            .eq("kind", KIND).execute().data)
    status = {r["asset_id"]: r["status"] for r in insp or []}
    return [Asset(a["id"], a["name"], status.get(a["id"])) for a in assets or []]


def choose_inspection(explicit: str | None, indexed: str | None, indexed_exists: bool,
                      pending: str | None, new_id=lambda: str(uuid.uuid4())) -> tuple[str, bool]:
    """Decide qué inspección usar. Devuelve (id, hay_que_crearla).

    Orden: id explícito, el índice local (si la fila existe), la inspección reanudable del activo,
    o una nueva. La nueva reutiliza el id del índice si lo había (así coinciden las rutas ya subidas).
    """
    if explicit:
        return explicit.lower(), False
    if indexed and indexed_exists:
        return indexed, False
    if pending:
        return pending, False
    return indexed or new_id(), True


def resolve_inspection(client, project_id: str, asset_id: str, index: LocalIndex) -> str:
    """Resuelve la inspección y, si es nueva, crea la fila antes de subir: la política de
    Storage exige que exista. Falla con InspectionLocked si ya está aprobada."""
    q = client.table("inspections")
    indexed = index.inspection_id(asset_id)
    indexed_row = None
    if indexed:
        found = q.select("id,status").eq("id", indexed).limit(1).execute().data
        indexed_row = found[0] if found else None
    # Única por (proyecto, activo, tipo): si existe en el servidor, se reutiliza.
    existing = indexed_row
    if existing is None:
        rows = (client.table("inspections").select("id,status").eq("project_id", project_id)
                .eq("asset_id", asset_id).eq("kind", KIND).limit(1).execute().data)
        existing = rows[0] if rows else None
    if existing is not None and existing["status"] == "approved":
        raise InspectionLocked("La inspección de esta turbina ya está aprobada; no se pueden subir más fotos.")
    insp, create = choose_inspection(None, indexed, indexed_row is not None,
                                     existing["id"] if existing else None)
    if create:
        client.table("inspections").insert({"id": insp, "project_id": project_id, "asset_id": asset_id,
                                            "kind": KIND, "status": "captured"}).execute()
    if index.inspection_id(asset_id) != insp:
        index.set_inspection(asset_id, insp)
        index.save()
    return insp
