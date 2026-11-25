# Catálogo de parques eólicos (formato de carga)

El script con el que se cargó el catálogo en producción **no está versionado aquí** (no se reconstruye de memoria). Quien
lo recargue debe respetar este formato; el asistente «Nuevo proyecto de campo» y `createFieldProject` dependen de él.

## Organización dueña

Una sola organización con `slug = 'nexus-01'` (nombre «NEXUS»), o la que indique la variable de entorno
`CATALOG_ORG_SLUG`. Todo el catálogo cuelga de ella.

## Parques (`public.sites`)

- `organization_id`: la organización del catálogo; `kind = 'wind_farm'`.
- `name`: nombre del parque (único por organización: `unique (organization_id, name)`). Es la clave con la que se copia
  y se reutiliza el parque en la organización de un cliente.
- `state`, `city`: estado y municipio (texto, opcionales; las agrega la migración `20261125000100_sites_state_city.sql`).
- `lat`, `lon`: opcionales (el catálogo actual no trae coordenadas).

## Máquinas (`public.assets`)

- `organization_id` y `site_id` del parque; `kind = 'wind_turbine'`.
- `name` con el formato **«WTG NN»** (con espacio y número con cero a la izquierda, p. ej. «WTG 01»); `code` con el
  formato **«WTGNN»** (sin espacio, p. ej. «WTG01»). `name` es único por parque (`unique (site_id, name)`) y es la clave
  con la que se copian las especificaciones al clonar.
- Un parque puede mezclar varios modelos (p. ej. máquinas 1–6 de un modelo y 7–33 de otro).

## Especificaciones (`public.wind_turbine_specs`)

Una fila por máquina (`asset_id`) con `manufacturer`, `model` y `hub_height_m`. `blade_length_m` y `rotor_diameter_m`
pueden ir vacíos (el catálogo actual no los trae); si algún día se cargan, se copian junto con el resto al clonar.

## Recarga segura

Cárgalo de forma idempotente (`insert ... on conflict do nothing` o `upsert` por esas claves únicas) y sin borrar
parques ni máquinas que ya tengan inspecciones. Las copias de clientes son independientes: recargar el catálogo no las
modifica.
