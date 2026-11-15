# ingest_demo

Demuestra el contrato de subida (§8 del diseño) y hace de `seed-media` (§9.1): lee fotos DJI con exiftool,
calcula el GSD (§5.6), genera `preview.webp` (2560 px) y `thumb.webp` (400 px), sube por TUS a Supabase Storage
y llama a `ingest_manifest`.

## Instalación

```
cd scripts/ingest_demo
python -m venv .venv
.venv/Scripts/pip install -e ".[dev]"
.venv/Scripts/pytest -q
```

## Uso

```
export NEXUS_PUBLISHABLE_KEY=<llave pública>        # npx supabase status -o env
# opcional: NEXUS_SUPABASE_URL (por defecto http://127.0.0.1:54321)
.venv/Scripts/python -m ingest_demo --folder <ruta> --project <uuid> --asset <uuid> --email tecnico@nexus.local \
    [--inspection <uuid>] [--exiftool <ruta>]
```

- La carpeta debe tener `Pala|Blade {A,B,C}/{TE,PS,LE,SS}/*.jpg`.
- La contraseña se pide con `getpass`. Para pruebas no interactivas se toma de la variable `NEXUS_PASSWORD`.
  Nunca se imprimen tokens. Solo se usa la llave pública, nunca una de servicio.
- Sin `--inspection` usa, en este orden: el índice local, la inspección `pending` del activo, o una nueva.
- `.ingest_index.json` (dentro de la carpeta de fotos; no se versiona) guarda los `id` por `sha256`, así repetir
  el comando es idempotente: la segunda corrida da `inserted = 0`.
- Los errores de `ingest_manifest` se imprimen con su `detail` (`[{path, code}]`).
- exiftool se resuelve en este orden: `--exiftool`, variable `NEXUS_EXIFTOOL`, `exiftool` en el PATH.
- Si la corrida falla a la mitad, el índice se guarda igual (en cada foto), así no quedan objetos huérfanos al reintentar.
- Fotos idénticas (mismo sha256) se suben una sola vez; las demás se omiten con un aviso.
