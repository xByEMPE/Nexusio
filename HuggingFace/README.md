---
title: IMAGES PROCESSING
emoji: 📉
colorFrom: yellow
colorTo: yellow
sdk: docker
pinned: false
license: apache-2.0
short_description: Blade damages detections
---

Check out the configuration reference at https://huggingface.co/docs/hub/spaces-config-reference

# Worker de IA de NEXUS (detección de daños en palas)

Detecta daños en las fotos RGB de inspecciones de pala (Faster R-CNN + U-Net ONNX, tiling de 2048 px, filtro por la
máscara de la pala y NMS) y los envía a la plataforma NEXUS, donde aparecen en la pestaña **Daños** del visor
(origen IA, estado «detectado», con su confianza). El modelo no cambia; solo cambió cómo se conecta a la base.

## Cómo funciona

1. Inicia sesión como un usuario con rol **Servicio** (no usa `service_role`; todo pasa por RLS) y renueva la sesión sola.
2. Cada `AI_POLL_SECONDS` llama a `ai_pending_captures(AI_BATCH_SIZE)`: fotos RGB con el original subido, de
   inspecciones de pala no aprobadas ni en borrado, sin run `done` y con menos de 3 intentos fallidos (las fallidas
   esperan 10 min antes de reintentarse).
3. Por cada foto: primero llama a `ai_start_run`, que cuenta el intento y deja un run provisional `failed/interrupted`
   (si el proceso muere a mitad, la foto no se descarga en bucle: tras 3 intentos se rinde); luego descarga el original, detecta, y llama a `ai_record_run`, que en **una transacción** ingesta los
   daños con `ingest_manifest` y marca la foto en `public.ai_runs` (`done`, o `failed` con el error). La imagen se decodifica con la orientación EXIF aplicada y, si sus
   dimensiones no coinciden con `width_px`/`height_px` de la captura, se registra `failed` («dimensiones de la imagen ...»).
   Tope de píxeles explícito: 150 MP.
4. Una foto que falla se registra `failed` y el ciclo continúa. Sin descargas repetidas: una foto con run `done` no se
   vuelve a pedir ni a descargar.

Detalles de los daños: tipo `ai_unclassified` («Daño detectado (IA)»; el modelo solo da categoría 1-5 = severidad, un
humano reclasifica en el visor), región `box` normalizada 0-1 sobre el tamaño de la captura, medidas calculadas con
el `gsd_mm_px` y el `radius_center_m` de la captura (mismas fórmulas que el visor; sin GSD no hay medidas) y ids
deterministas `uuid5(capture_id + índice + versión del modelo)`. **Nunca se pisa un daño que ya existe** (corregido
por una persona o no): si se reprocesa una foto con la misma versión del modelo no cambia nada.

## Secretos del Space (Settings > Variables and secrets)

| Secreto | Descripción |
| --- | --- |
| `SB_URL` | URL del proyecto de Supabase (`https://xxxx.supabase.co`) |
| `SB_PUBLISHABLE_KEY` | Llave **publicable** (anon) del proyecto. Nunca la `service_role` |
| `NEXUS_WORKER_EMAIL` | Correo del usuario Servicio |
| `NEXUS_WORKER_PASSWORD` | Contraseña de ese usuario |

Variables opcionales (no son secretas): `AI_BATCH_SIZE` (10), `AI_POLL_SECONDS` (60), `AI_BATCH_PAUSE_SECONDS` (5),
`AI_MODEL_NAME` (`fasterrcnn-resnet50-fpn`), `AI_MODEL_VERSION` (`1.0.0`). **Subir `AI_MODEL_VERSION` cuando se
cambien los pesos**: la versión forma parte de los ids de los daños y de lo que se guarda en cada daño.

## Crear el usuario Servicio y asignarlo a proyectos

1. Portal de administración > **Usuarios**: invitar a un correo propio para el worker (p. ej. `ia@tu-dominio`) y
   asignarle el rol **Servicio**. Completar la invitación (fijar contraseña) y guardar correo y contraseña como
   secretos del Space.
2. En cada proyecto que deba procesar la IA: asignar a ese usuario (Proyecto > Personal asignado). Sin asignación no
   ve nada: la IA solo procesa los proyectos a los que se la asigna.
3. El rol Servicio no borra datos ni edita proyectos; solo lee lo asignado y escribe daños con `ai_record_run`.

## Despliegue del Space

El repo del Space es **aparte** de este repo. Copiar a él el contenido de esta carpeta (sin `tests/`) y añadir los
pesos con git lfs **solo en el repo del Space** (nunca en el de NEXUS; `.gitignore` bloquea `*.pth` y `*.onnx`):

```bash
git lfs install
git lfs track "*.pth" "*.onnx"
# colocar: fasterrcnn_wind_turbine_damage.pth, blade_unet_512.onnx,
#          fasterrcnn_resnet50_fpn_coco-258fb6c6.pth, resnet50-0676ba61.pth
git add .gitattributes . && git commit -m "Worker NEXUS" && git push
```

El contenedor sirve «AI Worker Active» en el puerto 7860 (el Space lo necesita) mientras el worker trabaja. Un Space
gratuito se duerme sin visitas: el flujo `.github/workflows/keepalive-hf.yml` de este repo lo visita cada 6 h
usando la variable de repositorio `HF_SPACE_URL` (Settings > Secrets and variables > Actions > Variables; sin
secretos). Si no está definida, no hace nada.

## Reprocesar una captura

Solo un admin: borrar su fila de `ai_runs` (SQL Editor de Supabase):

```sql
delete from public.ai_runs where capture_id = '<id de la captura>';
```

Vuelve a entrar en la cola. Con la misma versión del modelo los daños ya existentes no se tocan; para volver a
generar daños distintos, subir `AI_MODEL_VERSION` (ids nuevos) y borrar antes los daños de IA obsoletos desde el visor.
Para ver fallos: `select capture_id, attempts, last_error from public.ai_runs where status = 'failed';`.

## Consumo de egress (plan gratuito de Supabase)

Lo que se descarga son solo los **originales RGB** de las fotos pendientes (unos 5-15 MB cada uno). Cada ciclo registra
en el log `N encontradas, ... X MB descargados`. Reglas para gastar poco: solo RGB, lotes de `AI_BATCH_SIZE`, un ciclo
a la vez, pausa entre lotes llenos, sondeo cada `AI_POLL_SECONDS` sin trabajo (la consulta de pendientes pesa bytes),
nada de redescargas (run `done` = no se pide más) y las fallidas esperan 10 min y se rinden a los 3 intentos.
Estimación: un lote de 10 fotos de 10 MB son unos 100 MB; una inspección de 3 palas con ~300 fotos RGB son
~3 GB, así que conviene asignar la IA proyecto a proyecto y vigilar el panel de uso de Supabase.

## Desarrollo y pruebas

La lógica está en `nexus_detector/` (sin torch) y `main.py` solo une el modelo. Las pruebas no necesitan torch ni
Supabase:

```bash
pip install -r requirements-dev.txt
pytest
```

Validan medidas, manifiesto contra `src/contracts/ingest-manifest.v1.schema.json`, ids deterministas, recorte de cajas,
reintentos y que no se filtren credenciales a los logs.
