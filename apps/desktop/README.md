# NEXUS Desktop

App de escritorio (Python 3.12) que lee las fotos de inspección, calcula el GSD, genera derivados WebP, los sube por TUS a
Supabase Storage y registra todo con `ingest_manifest`. Promueve el antiguo `scripts/ingest_demo`.

## Instalación

```
py -3.12 -m venv apps/desktop/.venv
apps/desktop/.venv/Scripts/python -m pip install -e "apps/desktop[dev]"
apps/desktop/.venv/Scripts/python -m pytest apps/desktop/tests -q
```

## Configuración

- `NEXUS_SUPABASE_URL` (por defecto `http://127.0.0.1:54321`) y `NEXUS_PUBLISHABLE_KEY` (llave pública; `npx supabase status -o env`).
- Solo se usa la llave pública, nunca una de servicio. Nunca se imprimen tokens.
- exiftool se resuelve en este orden: argumento, variable `NEXUS_EXIFTOOL`, `exiftool` en el PATH.
- El esquema del manifiesto vive en `nexus_desktop/schema/` (copia de `src/contracts/ingest-manifest.v1.schema.json`; una prueba verifica que coincidan).

## Reglas de ingesta que siguen vigentes

- Antes de cada subida TUS se renueva la sesión si el token vence en menos de 5 minutos.
- `.ingest_index.json` (junto a las fotos; no se versiona) guarda los `id` por `sha256`, así repetir la subida es idempotente.
- Fotos idénticas (mismo sha256) se suben una sola vez.
- Las tiras `*_img_stitched/<x>_<A|B|C>_<LeadingEdge|PressureSide|SuctionSide|TrailingEdge>.<ext>` se suben como mosaicos `blade_strip`.
- Carpeta `_ID`: su primer `*.JPG` se sube como captura RGB sin bloque `blade` y fija la posición de la turbina
  (láser `lrf_target` si es válido; si no, GPS del dron).

`legacy/` conserva el CLI anterior solo como referencia; no se instala ni se ejecuta.
