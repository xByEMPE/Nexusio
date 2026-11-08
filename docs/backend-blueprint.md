# NEXUS · Blueprint de backend e infraestructura (Supabase)

Este documento describe el backend de la plataforma: modelo de datos multi-inquilino, seguridad por filas, autenticación empresarial y almacenamiento de capturas. La implementación ejecutable está en [`supabase/migrations/20261108000000_initial_schema.sql`](../supabase/migrations/20261108000000_initial_schema.sql).

---

## 1. Principios

| Principio | Decisión |
|---|---|
| Aislamiento por inquilino | Toda fila de dominio lleva `org_id`. RLS filtra por las membresías activas del usuario. Ninguna regla depende solo de la UI. |
| Mínimo privilegio | Cuatro roles por organización: `admin`, `pilot`, `inspector`, `viewer`. `anon` no tiene privilegios sobre tablas de dominio. |
| Cadena de custodia | Cada binario registra SHA-256, tamaño, aeronave, vuelo y autor. Hash, ruta y tamaño son inmutables por trigger. |
| Auditoría | `audit_log` es de solo inserción. Lo escriben triggers `SECURITY DEFINER`, lo leen solo administradores. |
| MFA real | Si `organizations.require_mfa = true`, las funciones de autorización excluyen la organización cuando la sesión no es AAL2. La protección vive en la base de datos, no en el frontend. |
| Contratos compartidos | Los esquemas Zod de `src/contracts` validan en cliente y en route handler. Las restricciones `CHECK` de Postgres repiten los límites críticos. |

---

## 2. Modelo de datos

```
organizations ─┬─< organization_members >── auth.users ──1:1── profiles
               ├─< sites ──< assets
               ├─< aircraft
               ├─< missions ──< mission_assets >── assets
               ├─< flights ──< flight_telemetry   (particionada por mes)
               │      └─< media_assets            (metadatos; binarios en Storage)
               ├─< inspection_reports ──< findings >── assets / media_assets / flights
               └─< audit_log                      (sin FK, sobrevive a la organización)

assessment_requests   (formulario público; solo service_role)
```

### Geoespacial (PostGIS, SRID 4326)

| Columna | Tipo | Uso |
|---|---|---|
| `sites.boundary` | `geography(MultiPolygon)` | Perímetro de faena / subestación |
| `assets.location` | `geography(PointZ)` | Punto de referencia con altura |
| `assets.footprint` | `geography(Geometry)` | Traza de línea, polígono de parque FV |
| `missions.planned_route` | `geography(LineStringZ)` | Ruta planificada (derivada del WPML) |
| `flights.flown_path` | `geography(LineStringZ)` | Ruta ejecutada |
| `media_assets.capture_point` | `geography(PointZ)` | Posición de la cámara en la captura |
| `findings.location` | `geography(PointZ)` | Posición georreferenciada del hallazgo |

Todas tienen índice GiST. Consultas típicas: hallazgos a menos de N metros de un activo (`ST_DWithin`), capturas dentro del perímetro de un sitio (`ST_Intersects`), vuelos que cruzan un corredor.

### Telemetría

`flight_telemetry` está particionada por rango mensual sobre `recorded_at`. `private.ensure_telemetry_partition(date)` crea la partición del mes; programarla con `pg_cron`:

```sql
select cron.schedule('telemetry-partitions', '0 3 25 * *',
  $$ select private.ensure_telemetry_partition((date_trunc('month', now()) + interval '1 month')::date) $$);
```

Cada partición tiene RLS activada sin políticas y se le revocan los privilegios a `anon` y `authenticated`. Así el único acceso es por la tabla padre, donde aplican las políticas.

### Integridad entre organizaciones

Las claves foráneas no impiden que un hallazgo de la organización A apunte a un activo de la organización B. `private.enforce_same_org()` lo valida en `findings`, `flights`, `mission_assets`, `media_assets` y `flight_telemetry`.

### Flujos sellados por trigger

- `findings`: al salir de `detected`, se registra `reviewed_by = auth.uid()` y `reviewed_at`. Un `CHECK` exige revisor para cualquier estado distinto de `detected`.
- `inspection_reports`: al pasar a `approved` o `published`, se sellan aprobador y fechas.
- `organization_members`: no se puede degradar ni eliminar al último administrador activo, salvo que se elimine la organización completa.

---

## 3. Row-Level Security

### Patrón de rendimiento

Las políticas usan subconsultas **no correlacionadas**:

```sql
using (org_id in (select private.org_ids_with_role(array['admin','inspector']::public.app_role[])))
```

El planificador evalúa la función una vez por sentencia (hashed subplan), no una vez por fila. Las funciones son `SECURITY DEFINER`, `STABLE`, con `search_path = ''`, viven en el esquema `private` (no expuesto por la Data API) y se apoyan en el índice `organization_members_user_idx (user_id) include (org_id, role, status)`.

### Matriz de permisos

| Recurso | admin | pilot | inspector | viewer |
|---|---|---|---|---|
| Organización (editar), miembros | RW | R | R | R |
| Sitios, activos | RW | R | RW | R |
| Aeronaves | RW | R | R | — |
| Misiones, vuelos | RW | RW (solo sus vuelos) | R | — |
| Telemetría | RW | RW | R | — |
| Media RAW | RW | R + carga | R + carga | — |
| Entregables (ortomosaicos, nubes, PDF) | RW | R | RW | R |
| Reportes borrador | RW | R | RW | — |
| Reportes publicados y sus hallazgos | RW | R | RW | R |
| Auditoría | R | — | — | — |
| `assessment_requests` | solo `service_role` | | | |

### Verificación

La migración se validó en Postgres 17 + PostGIS (PGlite), con un stub de los esquemas `auth` y `storage`. Se ejecutaron 34 aserciones: aislamiento entre organizaciones, bloqueo por falta de AAL2, permisos de cada rol, inmutabilidad de hash y auditoría, acceso directo a particiones, políticas de Storage, hook de JWT y borrado en cascada. Para repetirlo en un entorno real, lo recomendado es [pgTAP](https://supabase.com/docs/guides/database/extensions/pgtap) con `supabase test db`.

---

## 4. Autenticación

| Capacidad | Implementación |
|---|---|
| SSO empresarial | SAML 2.0 de Supabase Auth (Entra ID, Okta, Google Workspace). Alta por CLI: `supabase sso add --type saml --metadata-url … --domains minera.cl`. |
| Alta automática | `private.handle_new_user()` crea el perfil. Si la identidad es federada (`provider` empieza por `sso:`) y el dominio coincide con `organizations.sso_domain`, agrega al usuario con `sso_default_role`. Correo y contraseña nunca se unen automáticamente. |
| Registro abierto | Desactivado (`enable_signup = false`). Solo por invitación o SSO. |
| MFA | TOTP y WebAuthn habilitados. La exigencia por organización se aplica en RLS mediante el claim `aal`. `create_organization()` exige AAL2. |
| RBAC en el token | `public.custom_access_token_hook` agrega `app_metadata.orgs = [{org_id, role}]` para que la UI decida qué mostrar. **RLS no confía en este claim**: consulta las tablas, de modo que una revocación tiene efecto inmediato y no al expirar el JWT. |
| Sesiones | JWT de 1 h, rotación de refresh token, `@supabase/ssr` con cookies `HttpOnly` en Next.js. |

Flujo de inicio de sesión del portal:

1. `signInWithSSO({ domain })` redirige al IdP corporativo.
2. Al volver, si el usuario tiene factores registrados y `aal` es `aal1`, el portal llama a `mfa.challenge()` / `mfa.verify()`.
3. Con AAL2, el token incluye `orgs` y la Data API devuelve filas.

---

## 5. Storage

| Bucket | Contenido | Límite por archivo | Lectura | Escritura |
|---|---|---|---|---|
| `raw-captures` | JPEG/DNG/MP4 de vuelo, KMZ, logs | 500 MB | admin, pilot, inspector | admin, pilot, inspector |
| `thermal` | R-JPEG / TIFF radiométrico | 500 MB | admin, pilot, inspector | admin, pilot, inspector |
| `orthomosaics` | GeoTIFF/COG RGB y térmico, MDS/MDT | 20 GB | todos los miembros | admin, inspector, workers |
| `point-clouds` | LAZ, COPC, 3D Tiles | 50 GB | todos los miembros | admin, inspector, workers |
| `reports` | PDF, JSON, CSV de reportes | 100 MB | todos los miembros | admin, inspector |

- Todos los buckets son privados. Las políticas de `storage.objects` exigen que el primer segmento de la ruta sea un `org_id` del usuario: `{org_id}/{flight_id|site_id}/{archivo}`. `media_assets` tiene un `CHECK` que obliga a esa misma convención.
- El acceso a binarios se hace solo con URLs firmadas de vida corta (`createSignedUrl(path, 300)`), que a su vez requieren permiso `SELECT` sobre el objeto. Ver `signedMediaUrl()` en `src/services/supabase/browser.ts`.
- Archivos de más de 6 MB: carga reanudable (TUS) desde el cliente o la app MSDK. Ortomosaicos y nubes los escriben los workers de procesamiento con `service_role`.
- Sobrescritura y borrado: solo administradores, para preservar la cadena de custodia.
- Retención: un job de `pg_cron` o una Edge Function programada elimina el RAW más antiguo que `organizations.retention_raw_days` y deja el evento en `audit_log`.

---

## 6. Observabilidad (ODD)

| Señal | Origen | Destino |
|---|---|---|
| Logs estructurados JSON | `createLogger(domain)`, isomórfico | stdout → log drain (Vercel, Fluent Bit, Datadog) |
| Spans con duración | `logger.span()`; propagación `traceparent` W3C navegador → API | mismo `traceId` en el log del cliente y del route handler |
| Core Web Vitals | `useReportWebVitals` → `sendBeacon('/api/telemetry')` | línea `web.vitals` por métrica, con `rating` |
| Telemetría de vuelo | `useTelemetryStream`: valida una de cada 50 tramas con Zod y detecta huecos de `seq` | eventos `telemetry.stream` (`frame.gap`, `frame.invalid`) |
| Periféricos / enlaces | `FleetMonitor`: attach/detach de stream, picos de latencia | eventos `peripheral.link` |
| Base de datos | `pg_stat_statements`, Supabase Logs, `get_advisors` | panel de Supabase |

Dominios de evento definidos en `src/contracts/observability.ts`: `ui.interaction`, `ui.navigation`, `telemetry.stream`, `peripheral.link`, `assessment.submit`, `web.vitals`, `api.request`.

---

## 7. Despliegue de la migración

```bash
supabase link --project-ref <ref>
supabase db push                      # aplica supabase/migrations
npm run db:types                      # regenera src/services/supabase/database.types.ts
```

Después de aplicarla:

1. Dashboard › Authentication › Hooks: activar *Custom Access Token* → `public.custom_access_token_hook`.
2. Dashboard › Authentication › MFA: confirmar TOTP/WebAuthn.
3. Registrar los IdP SAML y definir `organizations.sso_domain`.
4. Programar `ensure_telemetry_partition` con `pg_cron`.
5. Revisar *Security Advisor* y *Performance Advisor*.
