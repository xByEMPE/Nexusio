import logging

import pytest

from nexus_detector.client import NexusClient, retry
from nexus_detector.config import Config, ConfigError, load_config
from nexus_detector.errors import is_auth_error, is_transient, safe_error
from nexus_detector.worker import run_cycle, serve

CFG = Config(
    sb_url="https://x.supabase.co", sb_publishable_key="sb_publishable_KEY", worker_email="worker@nexus.test",
    worker_password="s3cret-pass", batch_size=3, poll_seconds=60, pause_seconds=5,
    model_name="fasterrcnn", model_version="1.0.0",
)


class FakeClient:
    def __init__(self, pending, files=None, fail_download=(), fail_record_done=(), already_done=()):
        self.events = []
        self.already_done = set(already_done)
        self._pending = pending
        self.files = files or {}
        self.fail_download = set(fail_download)
        self.fail_record_done = set(fail_record_done)
        self.records = []
        self.downloads = []

    def pending(self, limit):
        return self._pending[:limit]

    def start(self, capture_id, model, version):
        self.events.append(("start", capture_id))
        return {"status": "already_done" if capture_id in self.already_done else "started"}

    def download(self, path):
        self.events.append(("download", path))
        self.downloads.append(path)
        if path in self.fail_download:
            raise RuntimeError(f"no se pudo bajar https://x.supabase.co/storage/v1/object/sign/{path}?token=eyJabcde.fghij.klmno")
        return self.files.get(path, b"x" * 1000)

    def record(self, manifest, capture_id, model, version, error=None):
        if error is None and capture_id in self.fail_record_done:
            raise RuntimeError("manifest_invalid")
        self.records.append({"manifest": manifest, "capture_id": capture_id, "error": error})
        return {"status": "failed" if error else "done"}


def cap(i, base):
    c = dict(base)
    c["capture_id"] = f"00000000-0000-4000-8000-00000000000{i}"
    c["original_path"] = f"p/{i}.jpg"
    return c


def detector_ok(data):
    return [{"box": [100, 100, 300, 300], "score": 0.9, "label": 3}], 5280, 3956


def test_ciclo_normal_registra_cada_foto_y_cuenta_bytes(capture):
    client = FakeClient([cap(1, capture), cap(2, capture)])
    stats = run_cycle(client, detector_ok, CFG)
    assert (stats.found, stats.done, stats.failed, stats.findings, stats.bytes_downloaded) == (2, 2, 0, 2, 2000)
    assert all(r["error"] is None and r["manifest"] is not None for r in client.records)


def test_foto_sin_detecciones_solo_marca_el_run(capture):
    client = FakeClient([cap(1, capture)])
    run_cycle(client, lambda d: ([], 5280, 3956), CFG)
    assert client.records == [{"manifest": None, "capture_id": cap(1, capture)["capture_id"], "error": None}]


def test_una_foto_que_falla_se_registra_failed_y_el_ciclo_continua(capture):
    client = FakeClient([cap(1, capture), cap(2, capture), cap(3, capture)], fail_download={"p/2.jpg"})
    stats = run_cycle(client, detector_ok, CFG)
    assert (stats.done, stats.failed) == (2, 1)
    failed = [r for r in client.records if r["error"]]
    assert [r["capture_id"] for r in failed] == [cap(2, capture)["capture_id"]]
    assert client.downloads == ["p/1.jpg", "p/2.jpg", "p/3.jpg"]  # la 3 se procesó pese al fallo de la 2


def test_el_error_registrado_no_lleva_urls_ni_tokens(capture):
    client = FakeClient([cap(2, capture)], fail_download={"p/2.jpg"})
    run_cycle(client, detector_ok, CFG)
    err = client.records[0]["error"]
    assert "supabase.co" not in err and "eyJ" not in err and "token=" not in err
    assert len(err) <= 300


def test_fallo_del_detector_se_registra_failed(capture):
    def boom(data):
        raise ValueError("imagen corrupta")

    client = FakeClient([cap(1, capture)])
    stats = run_cycle(client, boom, CFG)
    assert stats.failed == 1 and client.records[0]["error"].startswith("ValueError")


def test_si_ai_record_run_rechaza_el_exito_se_marca_failed(capture):
    client = FakeClient([cap(1, capture)], fail_record_done={cap(1, capture)["capture_id"]})
    stats = run_cycle(client, detector_ok, CFG)
    assert stats.failed == 1 and client.records[-1]["error"].startswith("RuntimeError")


def test_si_tambien_falla_registrar_el_fallo_el_ciclo_sigue(capture):
    class Broken(FakeClient):
        def record(self, manifest, capture_id, model, version, error=None):
            raise RuntimeError("sin red")

    client = Broken([cap(1, capture), cap(2, capture)], fail_download={"p/1.jpg"})
    stats = run_cycle(client, detector_ok, CFG)
    assert stats.failed == 2 and stats.done == 0
    assert client.downloads == ["p/1.jpg", "p/2.jpg"]


def test_el_intento_se_cuenta_antes_de_descargar(capture):
    client = FakeClient([cap(1, capture)])
    run_cycle(client, detector_ok, CFG)
    assert client.events[0] == ("start", cap(1, capture)["capture_id"]) and client.events[1][0] == "download"


def test_si_el_proceso_muere_tras_el_start_ya_se_conto_el_intento(capture):
    class Killed(BaseException):  # p. ej. SystemExit/KeyboardInterrupt/OOM-kill: no lo atrapa el ciclo
        pass

    def die(data):
        raise Killed()

    client = FakeClient([cap(1, capture)])
    with pytest.raises(Killed):
        run_cycle(client, die, CFG)
    assert client.events[0][0] == "start" and client.records == []  # queda 'failed/interrupted' en la base


def test_foto_con_run_done_no_se_descarga(capture):
    client = FakeClient([cap(1, capture)], already_done={cap(1, capture)["capture_id"]})
    stats = run_cycle(client, detector_ok, CFG)
    assert client.downloads == [] and stats.failed == 0 and client.records == []


@pytest.mark.parametrize("dims", [(3956, 5280), (4000, 3000)])
def test_dimensiones_distintas_se_registran_failed_con_mensaje_claro(capture, dims):
    client = FakeClient([cap(1, capture)])
    stats = run_cycle(client, lambda d: ([{"box": [1, 1, 50, 50], "score": 0.9, "label": 3}], dims[0], dims[1]), CFG)
    assert stats.failed == 1 and stats.done == 0
    err = client.records[0]["error"]
    assert err.startswith("DimensionMismatch") and "distintas de la captura 5280x3956" in err
    assert client.records[0]["manifest"] is None
    assert ("intercambiados" in err) == (dims == (3956, 5280))


def test_no_se_vuelve_a_descargar_en_el_mismo_ciclo(capture):
    client = FakeClient([cap(1, capture)])
    run_cycle(client, detector_ok, CFG)
    assert client.downloads == ["p/1.jpg"]


def test_ciclo_sin_pendientes_no_descarga_nada(capture):
    client = FakeClient([])
    stats = run_cycle(client, detector_ok, CFG)
    assert stats.found == 0 and client.downloads == []


def test_respeta_el_tamano_del_lote(capture):
    client = FakeClient([cap(i, capture) for i in range(1, 6)])
    stats = run_cycle(client, detector_ok, CFG)
    assert stats.found == 3


def test_serve_espera_segun_haya_trabajo(capture):
    waits = []
    pend = [cap(i, capture) for i in range(1, 4)]  # lote lleno -> pausa corta
    serve(FakeClient(pend), detector_ok, CFG, sleep=waits.append, max_cycles=1)
    serve(FakeClient([]), detector_ok, CFG, sleep=waits.append, max_cycles=1)  # vacío -> sondeo
    serve(FakeClient(pend[:1]), detector_ok, CFG, sleep=waits.append, max_cycles=1)  # lote parcial -> sondeo
    assert waits == [5, 60, 60]


def test_serve_sobrevive_a_un_fallo_al_listar(capture):
    class Down(FakeClient):
        def pending(self, limit):
            raise ConnectionError("sin red")

    waits = []
    serve(Down([]), detector_ok, CFG, sleep=waits.append, max_cycles=2)
    assert waits == [60, 60]


# --- reintentos -----------------------------------------------------------------------------------------------
def test_retry_reintenta_errores_transitorios_con_espera_exponencial():
    calls, waits = [], []

    def flaky():
        calls.append(1)
        if len(calls) < 3:
            raise ConnectionError("reset")
        return "ok"

    assert retry(flaky, attempts=3, base_delay=2, sleep=waits.append) == "ok"
    assert len(calls) == 3 and waits == [2, 4]


def test_retry_se_rinde_tras_los_intentos():
    waits = []
    with pytest.raises(TimeoutError):
        retry(lambda: (_ for _ in ()).throw(TimeoutError("lento")), attempts=3, sleep=waits.append)
    assert len(waits) == 2


def test_retry_no_reintenta_errores_de_la_api():
    calls = []

    def denied():
        calls.append(1)
        raise PermissionError("not_allowed")

    with pytest.raises(PermissionError):
        retry(denied, attempts=3, sleep=lambda s: None)
    assert len(calls) == 1


def test_clasificacion_de_errores():
    class ConnectError(Exception):
        pass

    class ApiError(Exception):
        def __init__(self, message, code):
            super().__init__(message)
            self.code = code

    assert is_transient(ConnectError("x")) and is_transient(TimeoutError()) and not is_transient(ValueError())
    assert is_auth_error(ApiError("JWT expired", "PGRST301")) and is_auth_error(Exception("JWT expired"))
    assert is_auth_error(Exception("InvalidJWT: token is expired")) and is_auth_error(Exception('"exp" claim timestamp check failed'))
    assert not is_auth_error(ApiError("not_allowed", "42501"))


# --- cliente: sesión ------------------------------------------------------------------------------------------
class FakeAuth:
    def __init__(self):
        self.sign_ins = 0
        self.refreshes = 0

    def sign_in_with_password(self, creds):
        self.sign_ins += 1
        assert creds["email"] == CFG.worker_email
        return type("R", (), {"session": type("S", (), {"expires_at": 10_000})()})()

    def refresh_session(self):
        self.refreshes += 1
        return type("R", (), {"session": type("S", (), {"expires_at": 20_000})()})()


class FakeSb:
    def __init__(self, fail_first_with=None):
        self.auth = FakeAuth()
        self.calls = 0
        self._fail = fail_first_with

    def rpc(self, name, params):
        sb = self

        class Q:
            def execute(self):
                sb.calls += 1
                if sb._fail and sb.calls == 1:
                    raise sb._fail
                return type("Res", (), {"data": [{"capture_id": "c"}]})()

        return Q()


def test_la_sesion_se_inicia_una_vez_y_se_renueva_antes_de_vencer():
    now = [1000.0]
    sb = FakeSb()
    client = NexusClient(CFG, sb=sb, clock=lambda: now[0])
    client.pending(10)
    client.pending(10)
    assert (sb.auth.sign_ins, sb.auth.refreshes) == (1, 0)
    now[0] = 10_000 - 60  # a menos de 120 s de vencer
    client.pending(10)
    assert sb.auth.refreshes == 1
    client.pending(10)  # nuevo vencimiento 20_000: no vuelve a renovar
    assert sb.auth.refreshes == 1


def test_un_jwt_rechazado_provoca_un_relogin_y_reintento():
    sb = FakeSb(fail_first_with=Exception("JWT expired"))
    client = NexusClient(CFG, sb=sb, clock=lambda: 1000.0)
    assert client.pending(10) == [{"capture_id": "c"}]
    assert sb.auth.sign_ins == 2


# --- configuración y secretos ---------------------------------------------------------------------------------
def test_config_con_valores_por_defecto():
    cfg = load_config({"SB_URL": "https://x.supabase.co/", "SB_PUBLISHABLE_KEY": "k", "NEXUS_WORKER_EMAIL": "e@x", "NEXUS_WORKER_PASSWORD": "p"})
    assert (cfg.batch_size, cfg.poll_seconds, cfg.sb_url) == (10, 60, "https://x.supabase.co")


def test_config_pide_los_secretos_y_valida_numeros():
    with pytest.raises(ConfigError, match="NEXUS_WORKER_PASSWORD"):
        load_config({"SB_URL": "u", "SB_PUBLISHABLE_KEY": "k", "NEXUS_WORKER_EMAIL": "e"})
    env = {"SB_URL": "u", "SB_PUBLISHABLE_KEY": "k", "NEXUS_WORKER_EMAIL": "e", "NEXUS_WORKER_PASSWORD": "p"}
    with pytest.raises(ConfigError):
        load_config({**env, "AI_BATCH_SIZE": "0"})
    with pytest.raises(ConfigError):
        load_config({**env, "AI_POLL_SECONDS": "abc"})


def test_repr_de_config_no_filtra_credenciales():
    text = repr(CFG) + str(CFG)
    for secret in (CFG.worker_email, CFG.worker_password, CFG.sb_publishable_key):
        assert secret not in text


def test_safe_error_oculta_secretos_correos_urls_y_jwt():
    exc = RuntimeError(
        "login worker@nexus.test con s3cret-pass en https://x.supabase.co/auth/v1/token?x=1 "
        "Bearer eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl apikey=abc123"
    )
    out = safe_error(exc, secrets=(CFG.worker_password,))
    for leaked in ("worker@nexus.test", "s3cret-pass", "supabase.co", "eyJhbGciOi", "abc123"):
        assert leaked not in out


def test_el_log_del_ciclo_no_contiene_secretos(capture, caplog):
    client = FakeClient([cap(1, capture)], fail_download={"p/1.jpg"})
    with caplog.at_level(logging.INFO):
        run_cycle(client, detector_ok, CFG)
    assert CFG.worker_password not in caplog.text and CFG.worker_email not in caplog.text
    assert "MB descargados" in caplog.text
