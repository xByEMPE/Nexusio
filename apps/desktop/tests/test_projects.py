import pytest

from nexus_desktop.nexus.projects import (Asset, InspectionLocked, Project, choose_inspection, list_assets,
                                          list_projects, resolve_inspection)
from nexus_desktop.storage.local_index import LocalIndex
from tests.conftest import FakeClient


def test_list_projects_empty_for_unassigned_user():
    assert list_projects(FakeClient()) == []


def test_list_projects_maps_rows():
    c = FakeClient({"projects": [{"id": "p1", "name": "Parque", "organization_id": "o1"}]})
    assert list_projects(c) == [Project("p1", "Parque", "o1")]


def test_list_assets_turbines_of_project_with_status_hint():
    c = FakeClient({
        "project_sites": [{"project_id": "p1", "site_id": "s1"}, {"project_id": "p2", "site_id": "s2"}],
        "assets": [{"id": "a1", "site_id": "s1", "kind": "wind_turbine", "name": "WTG-01"},
                   {"id": "a2", "site_id": "s1", "kind": "solar_block", "name": "B1"},
                   {"id": "a3", "site_id": "s2", "kind": "wind_turbine", "name": "WTG-09"}],
        "inspections": [{"id": "i1", "project_id": "p1", "asset_id": "a1", "kind": "wind_blade", "status": "captured"}],
    })
    assert list_assets(c, "p1") == [Asset("a1", "WTG-01", "captured")]
    assert list_assets(FakeClient(), "p1") == []


def test_choose_inspection_order():
    new = lambda: "nuevo"
    assert choose_inspection("ABC", "idx", True, "pend", new) == ("abc", False)
    assert choose_inspection(None, "idx", True, "pend", new) == ("idx", False)
    assert choose_inspection(None, "idx", False, "pend", new) == ("pend", False)
    assert choose_inspection(None, None, False, "pend", new) == ("pend", False)
    assert choose_inspection(None, "idx", False, None, new) == ("idx", True)
    assert choose_inspection(None, None, False, None, new) == ("nuevo", True)


def test_resolve_inspection_creates_row_before_upload(tmp_path):
    c, index = FakeClient(), LocalIndex(tmp_path)
    insp = resolve_inspection(c, "p", "a", index)
    assert c.inserted == [("inspections", {"id": insp, "project_id": "p", "asset_id": "a",
                                           "kind": "wind_blade", "status": "captured"})]
    assert LocalIndex(tmp_path).inspection_id("a") == insp


def test_resolve_inspection_reuses_pending_row(tmp_path):
    c = FakeClient({"inspections": [{"id": "pend", "project_id": "p", "asset_id": "a",
                                     "kind": "wind_blade", "status": "pending"}]})
    assert resolve_inspection(c, "p", "a", LocalIndex(tmp_path)) == "pend"
    assert c.inserted == []


def test_resolve_inspection_refuses_approved(tmp_path):
    c = FakeClient({"inspections": [{"id": "ap", "project_id": "p", "asset_id": "a",
                                     "kind": "wind_blade", "status": "approved"}]})
    index = LocalIndex(tmp_path)
    index.set_inspection("a", "ap")
    with pytest.raises(InspectionLocked) as exc:
        resolve_inspection(c, "p", "a", index)
    assert "aprobada" in str(exc.value)
    # Aunque el índice local esté vacío, la fila aprobada del servidor bloquea.
    with pytest.raises(InspectionLocked):
        resolve_inspection(c, "p", "a", LocalIndex(tmp_path / "otra") if (tmp_path / "otra").mkdir() is None else None)
    assert c.inserted == []
