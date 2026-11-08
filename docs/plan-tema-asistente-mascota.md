# Plan de trabajo: tema claro/oscuro, asistente de chat y mascota guía

Estado: propuesta para aprobar. Fecha: 08/11/2026.

---

## Aclaración previa: el botón "N"

El círculo con la "N" en la esquina inferior es el **indicador de desarrollo de Next.js**. Solo aparece al trabajar en local (`npm run dev`) y **no se ve en el sitio publicado**. No forma parte de la página, por eso no se puede reutilizar.

En su lugar se crean controles propios:

- un botón de tema (sol / luna) en el encabezado y en el menú móvil;
- un botón flotante abajo a la derecha, que será la mascota y abrirá el chat.

Para que el indicador de Next.js no estorbe mientras se revisa en local, se puede ocultar con `devIndicators: false` en `next.config.ts`.

---

## Resumen de fases

| Fase | Entrega | Duración aprox. | Depende de |
|---|---|---|---|
| 1 | Tema claro / oscuro | 1,5 días | — |
| 2 | Asistente de chat con IA | 4 días | Clave de API de Anthropic |
| 3 | Mascota guía | 3 días | Fase 2 para usarla como avatar del chat |
| 4 | Pruebas y publicación | 1 día | Fases 1 a 3 |

Total aproximado: **9 a 10 días hábiles**. Las fases 1 y 2 pueden avanzar en paralelo.

---

## Fase 1 · Tema claro / oscuro

**Objetivo:** el visitante elige el tema. La primera vez se respeta la preferencia de su sistema, y la elección se recuerda en visitas siguientes.

### Tareas

1. **Paleta clara.** Se agrega un segundo juego de valores para los mismos tokens que ya existen en `globals.css`, así ningún componente cambia de nombre de clase.

   | Token | Oscuro (actual) | Claro (propuesto) |
   |---|---|---|
   | `background-base` | `#000000` | `#F6F7F9` |
   | `surface-layer` | `#090A0C` | `#FFFFFF` |
   | `border-subtle` | `#262626` | `#E2E5EA` |
   | `foreground` | `#FFFFFF` | `#0B0D12` |
   | `accent-primary` | `#2F7BFE` | `#1F66E5` (más oscuro, para que el texto azul sobre blanco cumpla contraste AA) |
   | `accent-deep` | `#001233` | `#E6EEFF` |

2. **Sin parpadeo al cargar.** Un script mínimo en el `<head>` aplica el tema antes de que se pinte la página. Así se evita el destello blanco/negro típico de estos cambios.
3. **Botón de tema** en el encabezado y en el menú móvil: icono de sol y luna con transición de resorte, accesible por teclado y con su etiqueta.
4. **Elementos con color fijo** que hay que adaptar:
   - visor de nube de puntos (dibuja en Canvas, lee `palette.ts`);
   - degradados SVG del inspector térmico y del mapa;
   - halos azules de fondo;
   - foto de los Matrice 4: es oscura por naturaleza, así que se mantiene dentro de un panel oscuro también en tema claro;
   - logotipo: usa los tokens, así que se adapta solo.
5. **Verificación de contraste** (WCAG AA) en ambos temas y en todos los anchos.

---

## Fase 2 · Asistente de chat con IA

**Objetivo:** un asistente que responde dudas sobre NEXUS las 24 horas, sin una persona detrás. Cuando la conversación lo amerita, ofrece dejar los datos de contacto o lleva al formulario.

### Cómo funciona

```
Visitante ──► Widget de chat (navegador)
                 │  mensaje
                 ▼
          /api/assistant (servidor Next.js)
                 │  instrucciones + base de conocimiento + conversación
                 ▼
          API de Claude (Anthropic) ── respuesta en streaming ──► widget
                 │
                 └─ herramientas: guardar contacto · llevar a una sección
```

- **La clave de API vive solo en el servidor.** El navegador nunca la ve.
- **Respuesta en streaming:** el texto aparece mientras se genera, sin esperar a que esté completo.
- **Sin estado en el servidor:** la conversación se guarda en el navegador del visitante (`sessionStorage`) y se envía en cada turno.

### Base de conocimiento

- Se arma con los textos que ya existen en `site.ts`: servicios, ejemplo de app, drones compatibles, proceso, cuidado de datos y "Sobre nosotros".
- Se agrega un archivo de **preguntas frecuentes** (`content/faq.ts`) que tú validas: plazos típicos, cómo se cotiza, soporte, qué pasa si no tengo drones, etc.
- Se envía con **caché de prompt**: la base de conocimiento se cobra completa una sola vez y en los turnos siguientes cuesta alrededor del 5 % de su precio normal.

### Reglas de comportamiento

- Responde solo sobre NEXUS, sus servicios y el uso de drones DJI en ese contexto. Ante temas ajenos, lo dice con amabilidad y redirige.
- **No inventa precios, plazos cerrados ni compromisos.** Si no lo sabe, ofrece que un humano responda.
- Se presenta como asistente virtual, nunca como persona.
- Español de México, tono claro y breve, sin tecnicismos innecesarios.

### Herramientas del asistente

| Herramienta | Qué hace | Dónde queda |
|---|---|---|
| `registrar_contacto` | Guarda nombre, correo, empresa y necesidad, siempre con consentimiento del visitante | Nueva tabla en Supabase (`assistant_leads`) y aviso por correo opcional |
| `ir_a_seccion` | Desplaza la página a una sección (portal, app de ejemplo, formulario) | Acción en el navegador; no guarda nada |
| `abrir_formulario` | Abre la evaluación técnica con lo ya conversado prellenado | Formulario existente |

Las entradas de cada herramienta se validan con Zod antes de ejecutarse, con el mismo enfoque que el formulario actual.

### Protección y costo controlado

- Límite de mensajes por IP (reutiliza el limitador existente), largo máximo por mensaje y máximo de turnos por conversación (por ejemplo, 20).
- Tope de tokens por respuesta y alerta de gasto en la consola de Anthropic.
- Si el modelo rechaza una solicitud por seguridad, el widget muestra un mensaje neutro y ofrece el formulario.
- Registro de cada turno: tokens usados (incluido lo leído de caché), latencia, herramientas llamadas e identificador de traza, con la capa de observabilidad que ya tiene el proyecto.

### Interfaz del widget

- Botón flotante abajo a la derecha (la mascota de la Fase 3; mientras tanto, el isotipo).
- En escritorio, panel lateral. En teléfono, hoja a pantalla completa.
- Sugerencias de inicio con botones, por ejemplo: "¿Qué apps pueden hacer?", "¿Funciona con mi dron?", "Quiero una cotización".
- Accesible: navegación por teclado, `aria-live` para los mensajes nuevos, se cierra con Esc.
- **Carga diferida:** el código del chat se descarga solo cuando el visitante lo abre, así no afecta la velocidad inicial de la página.

### Modelo y costo estimado

Precios oficiales de Anthropic por millón de tokens (consultados hoy):

| Modelo | Entrada | Salida | Lectura de caché | Perfil |
|---|---|---|---|---|
| Claude Opus 5.5 | US$4 | US$20 | US$0,20 | Modelo más capaz de la línea Opus; recomendado por defecto |
| Claude Sonnet 5.5 | US$2 | US$10 | US$0,20 | Equilibrio entre costo y capacidad |
| Claude Haiku 5.5 | US$0,10 | US$0,50 | — | El más económico, para alto volumen |

**Recomendación:** empezar con **Claude Opus 5.5 con esfuerzo bajo**. Un chat de atención no necesita razonamiento profundo, y el esfuerzo bajo reduce tokens y latencia sin cambiar de modelo.

Estimación orientativa con una base de conocimiento de unos 8.000 tokens en caché y respuestas cortas:

- Opus 5.5: alrededor de **US$0,01 por turno**, unos **US$0,05–0,08 por conversación** de 6 turnos.
- Haiku 5.5: entre 20 y 40 veces menos.

La cifra real se mide en las primeras semanas con los registros de uso. Cambiar a un modelo más económico es una decisión tuya y se hace con una línea de configuración.

### Antes de publicar

Se prepara un set de unas 30 preguntas reales (preguntas frecuentes, dudas técnicas, intentos de sacarlo de tema, pedidos de precio) y se revisan las respuestas antes de activar el asistente.

---

## Fase 3 · Mascota guía

**Objetivo:** un personaje propio que hace la página más cercana y orienta al visitante, sin estorbar.

### Concepto propuesto: un dron derivado del isotipo

- Cuerpo basado en el logotipo: cuatro rotores con arcos azules y un núcleo central que funciona como **ojo**.
- Se expresa con el ojo (parpadea, mira hacia un lado), la inclinación del cuerpo y la velocidad de los rotores. No necesita boca ni rasgos humanos, así que se mantiene fiel a la marca.
- Nombre a definir. Algunas ideas: *Nexo*, *Rotor*, *Vega*.

### Estados animados

| Estado | Cuándo | Animación |
|---|---|---|
| Reposo | Siempre visible | Flota suavemente, rotores lentos |
| Atento | Al pasar el cursor o tocarlo | Se acerca, el ojo mira al usuario |
| Pensando | Mientras el asistente genera la respuesta | El núcleo pulsa, los rotores aceleran |
| Hablando | Mientras aparece el texto | Ligero balanceo |
| Señalando | Al sugerir una sección | Se inclina hacia ella |
| Dormido | Tras inactividad o con movimiento reducido | Rotores quietos, ojo entrecerrado |

**Técnica:** SVG con las mismas físicas de resorte del sitio, sin librerías pesadas. Con "reducir movimiento" activado en el sistema, se muestra estático.

### Qué hace como guía

1. **Avatar del chat:** es el botón que abre el asistente.
2. **Sugerencias por sección:** la primera vez que el visitante llega a una sección, muestra una burbuja breve. Por ejemplo, en el portal: "Toca un aerogenerador para ver su estado".
   - Máximo 3 por visita, se cierran con un toque, con opción "no mostrar más" que se recuerda.
3. **Recorrido guiado opcional** (unos 60 segundos): la mascota vuela por las secciones clave y explica cada una en una frase. Solo empieza si el visitante lo pide.

### Reglas para que no moleste

- Nunca tapa botones de acción ni el formulario.
- Sin sonidos y sin ventanas que se abran solas.
- En teléfono es más pequeña y las burbujas aparecen arriba del botón.

### Opción de mayor calidad (posterior)

Si más adelante se quiere un personaje con animación más rica, un ilustrador puede crearlo en Rive o Lottie. El código de estados se mantiene, solo cambia el dibujo.

---

## Fase 4 · Pruebas y publicación

- Revisión en teléfono, tablet y escritorio, en ambos temas.
- Contraste, teclado y lector de pantalla.
- Velocidad (Lighthouse): el chat y la mascota no deben empeorar la carga inicial.
- Prueba del asistente con el set de preguntas y revisión de costos reales en los primeros días.

---

## Lo que se necesita de tu parte

1. **Clave de API de Anthropic**, con un método de pago y un límite de gasto mensual configurado en su consola.
2. **Proyecto de Supabase** para guardar los contactos del asistente. Hoy la página funciona sin base de datos; habría que crearlo o conectarlo.
3. **Preguntas frecuentes reales:** las 10–15 dudas que más te hacen los clientes, con tus respuestas.
4. **Decisiones** sobre la mascota (concepto y nombre), el modelo del asistente y a qué correo llegan los contactos.
