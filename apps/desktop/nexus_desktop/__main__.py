"""Arranque: `python -m nexus_desktop` abre la ventana principal."""
from __future__ import annotations


def main() -> None:
    from nexus_desktop.ui.app import App, create_session

    session, error = create_session()
    App(session=session, config_error=error).mainloop()


if __name__ == "__main__":
    main()
