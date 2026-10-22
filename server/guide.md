# Guía Ugly Ads

Un **ugly ad** es un video vertical "nativo": un clip de fondo (gym, entrenador, stock, producto) con texto **fijo**
encima en burbujas estilo Instagram/Edits, y música de fondo. Funciona porque parece un story orgánico y no una
pieza de agencia. El texto se lee de un vistazo y el video da contexto sin competir.

## Flujo (siempre en este orden)

1. **Contexto.** Antes de escribir, reuní todo lo que haya: este chat, la memoria, el CLAUDE.md o los docs del
   proyecto, el brief, la promo, la landing. Si faltan datos clave (oferta, precio, fecha, público, CTA), preguntá.
   No inventes precios, fechas, descuentos ni beneficios.
2. **Comunicación primero.** Proponé el ángulo y **2-3 variantes de copy** ya divididas en bloques. Esperá que el
   usuario elija o ajuste. Recién con el copy aprobado se pasa al video.
3. **Footage.** `ugly_footage` con el link de Drive (o la carpeta). Elegí 1-3 candidatos que acompañen el mensaje:
   la acción del clip tiene que tener que ver con lo que se dice (curso de entrenador → alguien entrenando o
   enseñando; nutrición → comida/cocina; calistenia → barras/parque). Preferí clips verticales y con espacio libre.
4. **Corte (obligatorio).** `ugly_scan` sobre el clip elegido, con `target` = duración del ad. Los videos de
   stock o de gym suelen tener una previa larga hasta que pasa la acción (alguien que se acomoda antes de
   levantar la pesa). Mirá la hoja de fotogramas y elegí **desde qué segundo hasta cuál** se ve lo interesante:
   el ejercicio, el movimiento, el producto en uso. Ese tramo va en el spec como `start` y `end`, y define cuánto
   dura el ad. El tramo con más movimiento que sugiere la herramienta es una pista, no la respuesta. Decile al
   usuario el corte elegido ("uso del 0:07 al 0:19, que es cuando hace la sentadilla").
5. **Ubicación.** `ugly_inspect` sobre el tramo cortado (`start` y `length`). Ubicá el bloque de texto donde haya menos movimiento y
   detalle, sin tapar caras ni la acción principal y fuera de las franjas rojas (UI de Instagram). Las franjas
   con `cargado` bajo son las mejores. Si el sujeto está abajo, texto arriba (`position` 0.3-0.4) y viceversa.
6. **Preview.** `ugly_preview` y mirá la imagen con ojo crítico: ¿se lee todo en 2 segundos? ¿tapa la cara?
   ¿queda algo en rojo? ¿hay líneas huérfanas de 1 palabra? Ajustá y repetí. Mostrale el preview al usuario.
7. **Render.** `ugly_render`. La música sale aleatoria del mood que encaje (gym/energía por default) salvo que el
   usuario pida otra.
8. **Cambios.** Para iterar usá `ugly_last` y modificá solo lo pedido (texto, clip, estilo o música).

## Estructura del copy

Orden típico de arriba hacia abajo (no hace falta usar todos):

| Bloque | Estilo | Ejemplo |
|---|---|---|
| Hook / producto | `title` | `Instructorado de\n**Calistenia** [2026]` |
| Soporte corto | `plain` | `Curso 100% online\nCon certificado internacional` |
| Beneficios (2-3) | `bubble` blanco / color marca | `Bolsa laboral activa ✅` |
| Oferta / urgencia | `bubble` | `🔥 Precio especial de lanzamiento 🔥` |
| CTA | `bubble` negro, `size: "s"` | `Inscripciones abiertas` |

Reglas:
- **Máximo 6 bloques** y ~25 palabras en total. Si no se lee en 3 segundos, sobra texto.
- **Cortá las líneas a mano** con `\n` para que queden parejas (máx. 4-5 palabras por línea). Nada de una palabra
  sola en la última línea.
- Datos concretos > adjetivos: precio, cuotas, fecha de inicio, cantidad de clases, certificado.
- 1 emoji por bloque como mucho (✅ 🔥 💪 📲 ⏳ 🎓), y no en todos los bloques.
- `**negrita**` para resaltar la palabra que importa (nombre del producto, precio).
- Respetá las reglas de marca del proyecto (por ejemplo, nombres completos de productos, tono, voseo/tuteo).

## Estilos de bloque

- `title`: píldora con degradé (por default rosa → gris translúcido) y texto blanco liviano; `**negrita**` en lo
  importante. `gradient: ["#hex1", "#hex2"]` para usar colores de marca.
- `bubble`: el fondo clásico de texto de Instagram, con las líneas fusionadas. `bg` = color de fondo, `color` =
  texto (si lo omitís se elige negro o blanco según el contraste). `opacity` < 1 para el modo semitransparente.
- `plain`: texto sin fondo con sombra suave. Solo sobre zonas oscuras o tranquilas del video.

Tamaños: `xs s m l xl xxl` o un número (1 = base ≈ 52 px en 1080 de ancho). `title` arranca en 1.15.

## Colores

Paleta de Instagram disponible por nombre: `white`, `black`, `magenta` (#D10869), `pink`, `red`, `orange`,
`yellow`, `green`, `blue`, `purple`, `gray`. También cualquier `#hex` (usá los colores de la marca si los hay).

- Alterná fondos: blanco → color marca → blanco → negro. Máximo **2 colores fuertes** además de blanco y negro.
- Texto blanco sobre colores oscuros/saturados, negro sobre blanco y amarillo.
- **Separación texto / video:** por default hay una sombra suave detrás del bloque de texto (`shade`: 0.32) y un
  oscurecido parejo muy leve de todo el video (`dim`: 0.12). Así el texto no queda "pegado" encima del video y
  el fondo se sigue viendo. Si el clip es muy claro o cargado, subí `shade` a 0.4-0.5 antes que `dim`. Nunca
  apagues el video: tiene que verse.
- Los clips HDR de iPhone se convierten solos a SDR para que los colores no se laven.

## Zonas seguras

`safe_zone`: `reels` (default: 12% arriba, 24% abajo), `strict` (guía oficial de Meta: 14% / 35%), `stories`
(14% / 20%), `feed` (para 4:5 o 1:1). Si el texto no entra, se achica solo y aparece una advertencia: en ese
caso recortá copy en lugar de aceptar letra chica.

## Formato del spec

```json
{
  "clip": 3,
  "start": 0,
  "duration": 12,
  "format": "9:16",
  "end": 12,
  "position": "center",
  "shade": 0.32,
  "font": "instagram",
  "blocks": [
    { "style": "title", "text": "Instructorado de\n**Calistenia** [2026]" },
    { "style": "plain", "text": "Curso 100% online\nCon certificado internacional" },
    { "style": "bubble", "text": "Bolsa laboral activa ✅", "bg": "white" },
    { "style": "bubble", "text": "Videoteca +170 ejercicios +\ndemostraciones prácticas", "bg": "magenta" },
    { "style": "bubble", "text": "🔥 Aprovechá precio especial\nde lanzamiento 🔥", "bg": "white" },
    { "style": "bubble", "text": "Inscripciones abiertas", "bg": "black", "size": "s" }
  ],
  "music": { "track": "random", "mood": "gym", "volume": 0.8 }
}
```

- `clip`: número de la hoja de `ugly_footage`, link/ID de Drive o ruta local.
- `start` / `end`: el corte elegido con `ugly_scan` (segundos del clip original). Entre 8 y 15 s funciona bien.
  También se puede usar `duration` en lugar de `end`. Si el clip es más corto, se repite en loop.
- `font`: `instagram` (Instagram Sans si está instalada en la compu, si no Figtree) o `poppins`.
- `music.track`: `random`, un id de `ugly_music`, la ruta a un mp3 o `none`. `original_audio` mezcla el sonido
  del clip (0-1).

Los videos quedan en `~/UglyAds/AAAA-MM-DD/` junto a un `.json` con el spec, para poder rehacerlos.
