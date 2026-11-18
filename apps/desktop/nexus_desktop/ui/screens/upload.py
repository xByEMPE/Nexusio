"""Subida a NEXUS: cierre del flujo (resumen, progreso, reporte final y errores legibles).

Lee lo calculado en las pantallas anteriores (`app.state.sections`: tiras con su calibración y
radio/GSD por foto) y lo convierte en un `UploadPlan` (`build_upload_plan`). La subida
(`nexus.uploader.upload_inspection`) corre en un hilo de trabajo; sus avisos (`progress`) se
encolan y se muestran en el hilo de Tk con `after()`.

Dónde quedan los archivos: como la herramienta anterior, la reconstrucción guarda las tiras y
`{wtg}_reconstruction.json` DENTRO de la carpeta WTG del técnico, y el índice de la subida
(`.ingest_index.json`) también vive ahí. Esta pantalla nunca borra nada de esa carpeta, ni tras
una subida completa, y funciona igual si las tiras ya existían de una corrida anterior (se suben
las que estén; las que falten se avisan en el resumen y el orquestador las omite).

Reanudar: el índice local guarda lo ya subido, así que «Reintentar» o «Reanudar la subida»
continúan sin duplicar. Si la sesión caduca, la app vuelve al login conservando `app.state`
(carpeta, marcas, secciones, proyecto y turbina); tras entrar de nuevo se vuelve a esta pantalla.
Cada subida sin terminar queda además en `storage.pending` (config.data_dir()/pending.json) para
el panel «Inspecciones locales pendientes», y al empezar se guarda `{wtg}_inspeccion_lista.json`
(storage/ready.py) para poder retomarla desde el Inicio aunque se cierre la app.
"""
from __future__ import annotations

import errno
import logging
import queue
import threading
import tkinter as tk
from pathlib import Path
from tkinter import ttk

from nexus_desktop.config import resolve_exiftool
from nexus_desktop.nexus.builder import DIRECTIONS  # "unknown" no se envía al manifiesto
from nexus_desktop.nexus.projects import InspectionError, InspectionLocked
from nexus_desktop.nexus.uploader import PhotoInfo, StripInput, UploadPlan, UploadReport, upload_inspection
from nexus_desktop.storage import pending, ready
from nexus_desktop.storage.local_index import LocalIndex
from nexus_desktop.ui.screens.base import Screen
from nexus_desktop.ui.theme import TOKENS, font

POLL_MS = 100
log = logging.getLogger(__name__)

ACTION = "Qué hacer:"
# Un texto por código de error: explicación y, tras «Qué hacer:», la acción sugerida.
# Códigos del servidor (§8.3, supabase/migrations/20261111000700_inspections_ingest.sql y
# INGEST_ERROR_CODES de src/contracts/ingest-manifest.ts) y los locales del orquestador.
ERROR_TEXT: dict[str, str] = {
    "unsupported_version": ("El servidor no admite la versión del manifiesto que envía esta app. "
                            "Qué hacer: actualiza la app de escritorio a la última versión y vuelve a subir."),
    "forbidden_project": ("Tu usuario no tiene permiso para subir datos a este proyecto o inspección. "
                          "Qué hacer: pide a tu administrador que te asigne al proyecto y vuelve a intentarlo."),
    "inspection_locked": ("La inspección ya está aprobada y no admite más datos. "
                          "Qué hacer: si hay que corregirla, pide a un administrador que la reabra."),
    "asset_other_org": ("La turbina no pertenece a la organización del proyecto. "
                        "Qué hacer: revisa que elegiste el proyecto y la turbina correctos; si es así, avisa "
                        "a tu administrador."),
    "empty_manifest": ("El envío no traía fotos, tiras ni daños. "
                       "Qué hacer: revisa que la carpeta tenga fotos legibles y vuelve a subir."),
    "bad_path": ("La ruta de un archivo no corresponde a esta inspección. "
                 "Qué hacer: vuelve a subir; si se repite, avisa a soporte con esta lista."),
    "missing_object": ("Un archivo no estaba en el almacenamiento de NEXUS (por ejemplo, se borró allí). "
                       "Qué hacer: pulsa «Reintentar»: la app lo vuelve a enviar y registra la pala de nuevo."),
    "unknown_finding_type": ("Un daño usa un tipo que no existe en el catálogo. "
                             "Qué hacer: avisa a tu administrador para que revise el catálogo de tipos de daño."),
    "unknown_capture": ("Un daño apunta a una foto que no está en la inspección. "
                        "Qué hacer: vuelve a subir la pala completa; si se repite, avisa a soporte."),
    "unknown_mosaic": ("Un daño apunta a una tira que no está en la inspección. "
                       "Qué hacer: vuelve a subir la pala con sus tiras; si se repite, avisa a soporte."),
    "duplicate_sha256": ("La misma foto ya está registrada en esta inspección con otro identificador. "
                         "Qué hacer: no subas copias de una foto desde otra carpeta; si se perdió el índice "
                         "local de la carpeta, avisa a soporte."),
    "duplicate_id": ("Un identificador se repite dentro del envío. "
                     "Qué hacer: vuelve a subir; si se repite, avisa a soporte."),
    "foreign_id": ("Un identificador ya pertenece a otra inspección. "
                   "Qué hacer: no copies el índice local (.ingest_index.json) entre carpetas; avisa a soporte."),
    "finding_target_changed": ("Un daño ya registrado no puede cambiar de foto o de tira. "
                               "Qué hacer: corrige ese daño desde el portal de NEXUS."),
    "unknown": ("El servidor rechazó el envío sin dar detalles. "
                "Qué hacer: pulsa «Reintentar»; si se repite, avisa a soporte."),
    "schema_invalid": ("Los datos preparados no cumplen el formato de NEXUS y no se enviaron. "
                       "Qué hacer: avisa a soporte con esta lista (es un fallo de la app)."),
    "no_valid_photos": ("Ninguna foto se pudo leer, así que no se registró nada. "
                        "Qué hacer: revisa que las fotos no estén dañadas y que exiftool funcione, y vuelve "
                        "a subir."),
    "nothing_to_upload": ("La carpeta no tiene fotos de palas ni foto _ID. "
                          "Qué hacer: revisa que elegiste la carpeta WTG correcta."),
}
UNKNOWN_CODE_TEXT = ("Error no reconocido por esta versión de la app. "
                     "Qué hacer: actualiza la app; si se repite, avisa a soporte con esta lista.")

TABLE_TEXT = {"captures": "Fotos", "blade_captures": "Datos de pala", "thermal_captures": "Térmicas",
              "mosaics": "Tiras", "findings": "Daños"}
BASE_TABLES = ("captures", "blade_captures", "mosaics")  # las demás, solo si alguna cifra no es 0

MISSING_STATE = ("Falta la carpeta WTG, el proyecto, la turbina o el procesamiento: vuelve a la "
                 "verificación.")
EXIFTOOL_MISSING = ("No se encontró exiftool, necesario para leer los datos de cada foto. Indica su "
                    "ruta en la variable NEXUS_EXIFTOOL o agrégalo al PATH, y pulsa «Reintentar».")
RESUME_HINT = "Lo ya subido queda guardado: pulsa «Reintentar» y se continúa sin duplicar nada."
GENERIC_ERROR = ("No se pudo completar la subida (problema de conexión, del servidor o del disco). "
                 + RESUME_HINT)
NOT_COMPLETED = "La subida no se completó"
CANCELLED = "Subida cancelada; puedes reanudarla"
COMPLETE = "Subida completa"


def error_text(code: str) -> str:
    return ERROR_TEXT.get(code, UNKNOWN_CODE_TEXT)


def error_explanation(code: str) -> str:
    return error_text(code).split(ACTION)[0].strip()


def error_message(exc: Exception) -> str:
    """Texto en español de un fallo de la subida: nunca la traza ni el texto crudo de la
    excepción (podría llevar URLs o tokens), salvo los mensajes legibles de projects.py."""
    if isinstance(exc, (InspectionLocked, InspectionError)):
        return str(exc)
    if isinstance(exc, FileNotFoundError):
        name = Path(exc.filename).name if exc.filename else "un archivo necesario"
        return (f"No se encontró {name}. Revisa que la carpeta WTG siga en su sitio y que exiftool esté "
                f"disponible (NEXUS_EXIFTOOL). {RESUME_HINT}")
    if isinstance(exc, OSError) and exc.errno == errno.ENOSPC:
        return f"No queda espacio en el disco para los archivos temporales. Libera espacio. {RESUME_HINT}"
    if isinstance(exc, PermissionError):
        name = Path(exc.filename).name if exc.filename else "un archivo"
        return f"No se pudo leer o escribir {name} (permiso denegado). {RESUME_HINT}"
    return GENERIC_ERROR


def usable_calibration(calibration: dict | None) -> dict | None:
    """La calibración solo se envía si tiene escala (mm_per_px). Sin marcas (todo null) o con la
    punta y la raíz en la misma fila, el servidor la sobrescribiría con nulos y la daría por hecha."""
    if not calibration or calibration.get("mm_per_px") is None:
        return None
    return calibration


def build_upload_plan(state) -> UploadPlan:
    """`AppState` -> `UploadPlan`: una StripInput por sección (calibración tal cual, en píxeles de
    la tira guardada: el orquestador la escala, R5) y PhotoInfo por foto (radio y, si se conoce,
    el sentido de captura de su sección y, si su GSD es estimado, ese valor)."""
    if state.wtg is None or state.project is None or state.asset is None or not state.sections:
        raise ValueError(MISSING_STATE)
    strips: list[StripInput] = []
    photo_info: dict[Path, PhotoInfo] = {}
    for section in state.sections:
        strips.append(StripInput(section.blade, section.face, Path(section.strip_path),
                                 usable_calibration(section.calibration)))
        direction = section.direction if section.direction in DIRECTIONS else None
        for photo in section.photos:
            estimated = photo.gsd_mm_px if photo.gsd_estimated else None
            photo_info[photo.path] = PhotoInfo(photo.radius_m, direction, estimated)
    return UploadPlan(folder=state.wtg, project=state.project, asset=state.asset,
                      blade_length_m=state.blade_length_m, strips=strips, photo_info=photo_info)


def short_path(path: Path, limit: int = 90) -> str:
    """Ruta en una sola línea: completa si cabe; si no, «…» y las últimas carpetas."""
    text = str(path)
    if len(text) <= limit:
        return text
    parts = Path(path).parts
    tail = parts[-1]
    for part in reversed(parts[:-1]):
        candidate = str(Path(part) / tail)
        if len(candidate) + 2 > limit:
            break
        tail = candidate
    return str(Path("…") / tail)


def _count_label(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


class UploadScreen(Screen):
    def __init__(self, master, app) -> None:
        super().__init__(master, app)
        self._queue: queue.SimpleQueue = queue.SimpleQueue()
        self._cancel = threading.Event()
        self._poll_job: str | None = None
        self.running = False
        self.completed = False  # última corrida: completa y sin errores
        self.report: UploadReport | None = None
        self.log_lines: list[str] = []
        self._warnings: list[str] = []
        self._error_rows: dict[str, str] = {}  # item del árbol -> código

        top = ttk.Frame(self)
        top.pack(fill="x")
        ttk.Label(top, text="Subida a NEXUS", style="Title.TLabel").pack(side="left")

        summary = ttk.Frame(self, style="Panel.TFrame", padding=10)
        summary.pack(fill="x", pady=(12, 0))
        self.summary_label = ttk.Label(summary, text="", style="Panel.TLabel", wraplength=900, justify="left")
        self.summary_label.pack(anchor="w")
        # Avisos (tiras que faltan, índice local dañado): solo ocupa sitio si hay alguno.
        self.warning_label = ttk.Label(summary, text="", style="Panel.TLabel", foreground=TOKENS["caution"],
                                       wraplength=900, justify="left")

        self.status_label = ttk.Label(self, text="Revisa el resumen y pulsa «Subir a NEXUS».",
                                      wraplength=900, justify="left")
        self.status_label.pack(anchor="w", pady=(10, 6))
        self.progress_bar = ttk.Progressbar(self, orient="horizontal", mode="determinate", maximum=100)
        self.progress_bar.pack(fill="x")

        footer = ttk.Frame(self)
        footer.pack(side="bottom", fill="x", pady=(12, 0))
        self.cancel_button = ttk.Button(footer, text="Cancelar", style="Danger.TButton", command=self.cancel)
        self.cancel_button.pack(side="left")
        # Con el reporte a la vista el registro se oculta (así cabe en la ventana mínima); este botón
        # alterna entre los dos.
        self.log_button = ttk.Button(footer, text="Ver registro", command=self._toggle_log)
        self.upload_button = ttk.Button(footer, text="Subir a NEXUS", style="Accent.TButton", command=self.start)
        self.upload_button.pack(side="right")
        self.home_button = ttk.Button(footer, text="Volver al inicio", command=self._home)
        self.back_button = ttk.Button(footer, text="Volver a verificación", command=self._back)
        self.back_button.pack(side="right", padx=(0, 8))

        # Reporte final (se muestra al terminar, en lugar del registro): errores (si hay, primero: es
        # lo que nunca debe quedar recortado), conteos y archivos omitidos.
        self.report_frame = ttk.Frame(self)
        self.report_tree = ttk.Treeview(self.report_frame, columns=("table", "inserted", "updated", "skipped"),
                                        show="headings", height=5, selectmode="none")
        for key, title, width, anchor in (("table", "Registro", 220, "w"), ("inserted", "Insertados", 110, "e"),
                                          ("updated", "Actualizados", 110, "e"), ("skipped", "Omitidos", 110, "e")):
            self.report_tree.heading(key, text=title)
            self.report_tree.column(key, width=width, anchor=anchor, stretch=key == "table")
        self.report_tree.pack(fill="x")
        self.skipped_label = ttk.Label(self.report_frame, text="", foreground=TOKENS["caution"],
                                       wraplength=900, justify="left")
        self.skipped_label.pack(anchor="w", pady=(4, 0))

        self.errors_frame = ttk.Frame(self.report_frame)
        # El detalle (con «Qué hacer») va antes que la tabla: si falta alto, se recorta la tabla.
        self.error_detail_label = ttk.Label(self.errors_frame, text="", wraplength=900, justify="left")
        self.error_detail_label.pack(anchor="w", pady=(6, 0))
        self.errors_tree = ttk.Treeview(self.errors_frame, columns=("blade", "file", "path", "code", "text"),
                                        show="headings", height=3, selectmode="browse")
        for key, title, width in (("blade", "Pala", 45), ("file", "Archivo", 170), ("path", "Ruta", 170),
                                  ("code", "Código", 130), ("text", "Qué pasó", 330)):
            self.errors_tree.heading(key, text=title)
            self.errors_tree.column(key, width=width, minwidth=40, anchor="w", stretch=key == "text")
        errors_scroll = ttk.Scrollbar(self.errors_frame, orient="vertical", command=self.errors_tree.yview)
        self.errors_tree.configure(yscrollcommand=errors_scroll.set)
        errors_scroll.pack(side="right", fill="y", pady=(4, 0))
        self.errors_tree.pack(fill="x", pady=(4, 0))
        self.errors_tree.bind("<<TreeviewSelect>>", lambda _e: self._error_selected())

        self.log_frame = ttk.Frame(self, style="Panel.TFrame", padding=8)
        self.log_frame.pack(fill="both", expand=True, pady=(12, 0))
        self.log_text = tk.Text(self.log_frame, height=4, wrap="word", background=TOKENS["surface"],
                                foreground=TOKENS["text_muted"], insertbackground=TOKENS["text"],
                                relief="flat", borderwidth=0, font=font(9))
        scroll = ttk.Scrollbar(self.log_frame, orient="vertical", command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=scroll.set, state="disabled")
        scroll.pack(side="right", fill="y")
        self.log_text.pack(side="left", fill="both", expand=True)
        # El texto se ajusta al ancho real (la ventana puede ser de 760 px).
        self._wrapped = (self.summary_label, self.warning_label, self.status_label, self.skipped_label,
                         self.error_detail_label)
        self.bind("<Configure>", self._rewrap, add="+")

        self._set_buttons(running=False)
        self._fill_summary()

    # --- resumen ---

    def _fill_summary(self) -> None:
        state = self.app.state
        if state.wtg is None or state.project is None or state.asset is None or not state.sections:
            self.summary_label.configure(text=MISSING_STATE)
            self.upload_button.state(["disabled"])
            return
        wtg = state.wtg
        blade_photos = sum(len(paths) for faces in wtg.blades.values() for paths in faces.values())
        total = blade_photos + (1 if wtg.id_photo is not None else 0)
        photos = _count_label(total, "foto", "fotos")
        detail = f"{blade_photos} de palas" + (" y la foto _ID" if wtg.id_photo is not None else ", sin foto _ID")
        length = f" · Longitud de pala: {state.blade_length_m:g} m".replace(".", ",") if state.blade_length_m else ""
        self.summary_label.configure(text=(
            f"Proyecto: {state.project.name} · Turbina: {state.asset.name}\n"
            f"Carpeta: {short_path(wtg.path)}\n"
            f"Se suben {photos} ({detail}) y {_count_label(len(state.sections), 'tira', 'tiras')}{length}"))
        missing = [Path(s.strip_path).name for s in state.sections if not Path(s.strip_path).is_file()]
        if missing:
            self._add_warning("No se encontraron estas tiras (se omitirán; vuelve a procesar si las "
                              "necesitas): " + ", ".join(missing))

    def _add_warning(self, text: str) -> None:
        if text not in self._warnings:
            self._warnings.append(text)
        self.warning_label.configure(text="\n".join(self._warnings))
        self.warning_label.pack(anchor="w", pady=(6, 0))

    # --- ciclo de la subida ---

    def start(self) -> None:
        if self.running:
            return
        state = self.app.state
        try:
            plan = build_upload_plan(state)
        except ValueError:
            self._set_status(MISSING_STATE, TOKENS["critical"])
            return
        exiftool = resolve_exiftool()
        if exiftool is None:
            self._set_status(EXIFTOOL_MISSING, TOKENS["critical"])
            self._show_upload_button("Reintentar")
            return
        self._cancel = threading.Event()
        cancel, session = self._cancel, self.app.session
        folder, names = plan.folder.path, (plan.project.name, plan.asset.name)
        try:  # lo procesado queda en la carpeta: si la subida se interrumpe se puede retomar desde el Inicio
            ready.save_ready(state)
        except ready.SAVE_ERRORS as exc:
            log.warning("No se pudo guardar la inspección antes de subir (%s)", type(exc).__name__)
            self._add_warning(f"No se pudo guardar la inspección en la carpeta. {ready.save_error_text(exc)} "
                              "La subida sigue, pero si se interrumpe no podrás retomarla desde el Inicio.")
        self._mark_pending(folder, names, "in_progress")
        self.running = True
        self.completed = False
        self.report = None
        self._show_log_panel(True)
        self.log_button.pack_forget()
        self.progress_bar.configure(value=0)
        self._set_status("Subiendo…", TOKENS["text"])
        self._log("Inicio de la subida.")
        self._set_buttons(running=True)

        def work() -> UploadReport:
            try:
                index = LocalIndex(folder)
                if index.load_warning:
                    self._queue.put(("warning", index.load_warning, 0.0))
                report = upload_inspection(plan, session, index, exiftool, self._report, cancel)
            except BaseException:
                self._mark_pending(folder, names, "interrupted")
                raise
            if report.errors:
                self._mark_pending(folder, names, "errors")
            elif report.cancelled:
                self._mark_pending(folder, names, "cancelled")
            elif report.skipped.get("local_files"):  # algunas fotos no se subieron: no se olvida
                self._mark_pending(folder, names, "partial")
            else:
                self._mark_pending(folder, names, None)
                ready.mark_uploaded(folder)  # los datos se conservan; solo cambia su estado
            return report

        self.run_async(work, self._done, self._failed)
        self._schedule_poll()

    @staticmethod
    def _mark_pending(folder: Path, names: tuple[str, str], status: str | None) -> None:
        """Actualiza la lista local de subidas sin terminar (None: completa, se quita). Un fallo
        al escribirla no detiene la subida: la lista solo es una ayuda."""
        try:
            if status is None:
                pending.remove(folder)
            else:
                pending.save_status(folder, names[0], names[1], status)
        except OSError:
            pass

    def _report(self, message: str, fraction: float) -> None:
        """Lo llama el orquestador desde el hilo de trabajo: solo encola."""
        self._queue.put(("progress", message, fraction))

    def _schedule_poll(self) -> None:
        if self._poll_job is None:
            self._poll_job = self.after(POLL_MS, self._poll_tick)

    def _poll_tick(self) -> None:
        self._poll_job = None
        self._poll()
        if self.running:
            self._schedule_poll()

    def _poll(self) -> None:
        while True:
            try:
                kind, message, fraction = self._queue.get_nowait()
            except queue.Empty:
                return
            if kind == "warning":
                self._add_warning(message)
                continue
            self.progress_bar.configure(value=max(0.0, min(1.0, fraction)) * 100)
            self._log(message)
            if self.running and not self._cancel.is_set():
                self._set_status(message, TOKENS["text"])

    def _done(self, report: UploadReport) -> None:
        self._poll()
        self.running = False
        self.report = report
        self._show_report(report)

    def _failed(self, exc: Exception) -> None:
        self._poll()
        self.running = False
        message = error_message(exc)
        self._log(message)
        self._set_status(message, TOKENS["critical"])
        self._set_buttons(running=False)
        self.home_button.pack(side="right", padx=(0, 8), before=self.back_button)
        if isinstance(exc, InspectionLocked):  # reintentar fallaría igual: solo volver
            self.upload_button.pack_forget()
        else:
            self._show_upload_button("Reintentar")

    def cancel(self) -> None:
        if not self.running:
            return
        self._cancel.set()
        self.cancel_button.state(["disabled"])
        self._set_status("Cancelando… se termina el archivo en curso.", TOKENS["caution"])

    # --- reporte final ---

    def _show_report(self, report: UploadReport) -> None:
        self._fill_counts(report)
        local_files = [str(x) for x in report.skipped.get("local_files") or []]
        self.skipped_label.configure(text=(
            "Archivos omitidos por estar dañados o ilegibles: " + ", ".join(local_files)) if local_files else "")
        self._fill_errors(report.errors)
        self._show_log_panel(False)
        self.log_button.pack(side="left", padx=(8, 0))
        self._set_buttons(running=False)
        self.home_button.pack(side="right", padx=(0, 8), before=self.back_button)
        warnings = [str(w) for w in getattr(report, "warnings", None) or []]
        retryable = [str(w) for w in getattr(report, "retryable_warnings", None) or []]

        if report.errors:
            n = len(report.errors)
            text = (f"{NOT_COMPLETED}: {_count_label(n, 'error', 'errores')} (ver la tabla). "
                    "Lo ya subido queda guardado.")
            if report.cancelled:
                text += " Además, se canceló antes de terminar."
            self._set_status(text, TOKENS["critical"])
            if all(e.get("code") == "inspection_locked" for e in report.errors):
                self.upload_button.pack_forget()  # aprobada: reintentar fallaría igual
            else:
                self._show_upload_button("Reintentar")
        elif report.cancelled:
            self._set_status(f"{CANCELLED}: lo ya subido queda guardado y no se repite.", TOKENS["caution"])
            self._show_upload_button("Reanudar la subida")
        elif local_files or retryable:
            notes = []
            if local_files:
                notes.append(f"se omitieron {_count_label(len(local_files), 'archivo dañado', 'archivos dañados')}"
                             " (revísalos)")
            notes += warnings
            self._set_status("Subida terminada con avisos: " + "; ".join(notes), TOKENS["caution"])
            if retryable:  # p. ej. la posición no se guardó: reintentar puede arreglarlo
                self.completed = not local_files
                self._show_upload_button("Reintentar")
            else:
                self.upload_button.state(["disabled"])
        else:
            # Completa. Un aviso permanente (sin _ID, _ID sin láser ni GPS) va como nota: reintentar
            # no lo cambiaría, así que no se ofrece.
            self.completed = True
            inserted = sum(v for v in report.inserted.values() if isinstance(v, (int, float)))
            updated = sum(v for v in report.updated.values() if isinstance(v, (int, float)))
            text = f"{COMPLETE}: {inserted:g} registros nuevos y {updated:g} actualizados en NEXUS."
            if warnings:
                text += " Nota: " + " ".join(warnings)
            self._set_status(text, TOKENS["telemetry"])
            self.upload_button.state(["disabled"])

    def _fill_counts(self, report: UploadReport) -> None:
        tree = self.report_tree
        tree.delete(*tree.get_children())

        def number(d: dict, key: str) -> str:
            v = d.get(key, 0)
            if isinstance(v, list):
                v = len(v)
            return f"{v:g}" if isinstance(v, (int, float)) and not isinstance(v, bool) else "0"

        keys = list(BASE_TABLES)
        for d in (report.inserted, report.updated, report.skipped):
            keys += [k for k in d if k not in keys and k != "local_files"]
        rows = [(TABLE_TEXT.get(k, k), number(report.inserted, k), number(report.updated, k),
                 number(report.skipped, k)) for k in keys]
        # Las tablas fuera de las básicas (daños, térmicas…) solo si alguna cifra no es 0.
        rows = [r for k, r in zip(keys, rows) if k in BASE_TABLES or r[1:] != ("0", "0", "0")]
        tree.configure(height=min(len(rows), 6))
        for row in rows:
            tree.insert("", "end", values=row)

    def _fill_errors(self, errors: list[dict]) -> None:
        tree = self.errors_tree
        tree.delete(*tree.get_children())
        self._error_rows = {}
        if not errors:
            self.errors_frame.pack_forget()
            return
        for err in errors:
            code = str(err.get("code") or "unknown")
            item = tree.insert("", "end", values=(err.get("blade") or "—", err.get("file") or "—",
                                                  err.get("path") or "—", code, error_explanation(code)))
            self._error_rows[item] = code
        tree.configure(height=min(len(errors), 3))
        self.errors_frame.pack(fill="x", before=self.report_tree)
        first = tree.get_children()[0]
        tree.selection_set(first)
        self._error_selected(first)

    def _error_selected(self, item: str | None = None) -> None:
        if item is None:
            sel = self.errors_tree.selection()
            item = sel[0] if sel else None
        code = self._error_rows.get(item) if item else None
        self.error_detail_label.configure(text=f"{code}: {error_text(code)}" if code else "")

    # --- presentación ---

    def _show_log_panel(self, show_log: bool) -> None:
        """En el área de abajo va el registro (mientras sube) o el reporte (al terminar)."""
        if show_log:
            self.report_frame.pack_forget()
            self.log_frame.pack(fill="both", expand=True, pady=(12, 0))
        else:
            self.log_frame.pack_forget()
            self.report_frame.pack(fill="both", expand=True, pady=(12, 0))
        self.log_button.configure(text="Ver reporte" if show_log else "Ver registro")

    def _toggle_log(self) -> None:
        if self.report is not None:
            self._show_log_panel(not self.log_frame.winfo_manager())

    def _rewrap(self, event) -> None:
        if event.widget is self and event.width > 100:
            for label in self._wrapped:
                label.configure(wraplength=event.width - 60)

    def _show_upload_button(self, text: str) -> None:
        self.upload_button.configure(text=text)
        self.upload_button.state(["!disabled"])

    def _set_status(self, text: str, color: str) -> None:
        self.status_label.configure(text=text, foreground=color)

    def _log(self, message: str) -> None:
        self.log_lines.append(message)
        self.log_text.configure(state="normal")
        self.log_text.insert("end", message + "\n")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def _set_buttons(self, *, running: bool) -> None:
        def enable(button: ttk.Button, on: bool) -> None:
            button.state(["!disabled"] if on else ["disabled"])

        enable(self.cancel_button, running)
        enable(self.back_button, not running)
        enable(self.home_button, not running)
        enable(self.upload_button, not running)

    # --- navegación ---

    def _back(self) -> None:
        from nexus_desktop.ui.screens.verification import VerificationScreen

        if not self.running:
            self.app.show(VerificationScreen)

    def _home(self) -> None:
        """Al inicio. Tras una subida completa se olvida la carpeta (nueva turbina); si no, se
        conserva todo para reanudar desde «Continuar la subida». Nunca se borran archivos."""
        from nexus_desktop.ui.screens.start import StartScreen

        if self.running:
            return
        if self.completed:
            self.app.state.forget_folder()
        self.app.show(StartScreen)

    def on_hide(self) -> None:
        self._cancel.set()  # si se sale mientras sube, termina el archivo en curso y para
        if self._poll_job is not None:
            self.after_cancel(self._poll_job)
            self._poll_job = None
