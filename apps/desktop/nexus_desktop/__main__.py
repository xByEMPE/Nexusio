"""Arranque: `python -m nexus_desktop` abre la ventana principal."""
from __future__ import annotations


def main() -> None:
    import logging

    from nexus_desktop import applog, config

    applog.setup_logging()  # primero: lo que falle al arrancar también queda en el registro
    log = logging.getLogger("nexus_desktop")
    log.info("Inicio de NEXUS Importador %s", config.VERSION)

    from nexus_desktop.ui.app import App, create_session

    session, error = create_session()
    if error:
        log.warning("Configuración: %s", error)
    App(session=session, config_error=error).mainloop()
    log.info("Cierre de la app")


if __name__ == "__main__":
    main()
