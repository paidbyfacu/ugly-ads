---
description: Cambiar colores, fuente, tamaño o posición del texto del último ugly ad
argument-hint: "[ej. 'burbujas con el rosa de marca', 'texto más arriba', 'fuente poppins', 'más grande']"
---
Cambio de estilo en el último ugly ad. Pedido: $ARGUMENTS

1. `ugly_last` para traer el spec actual.
2. Traducí el pedido a campos del spec: `bg`/`color`/`gradient` por bloque, `font` (instagram | poppins),
   `text_scale`, `size` por bloque, `position`, `align`, `gap`, `dim`, `safe_zone`. Si nombra colores de la marca
   y los tenés en contexto, usá los hex exactos.
3. `ugly_preview` y revisá contraste y legibilidad (texto blanco sobre fondos oscuros, negro sobre claros).
4. `ugly_render` manteniendo texto, clip y música. Pasá la ruta del video.
