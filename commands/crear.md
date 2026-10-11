---
description: Crear un ugly ad de punta a punta (contexto → copy → clip → ubicación → render con música)
argument-hint: "[qué promo/producto + link de carpeta de Drive]"
---
Vamos a crear un **ugly ad** con el MCP `ugly-ads`. Pedido del usuario: $ARGUMENTS

Seguí este proceso sin saltear pasos:

1. **Guía.** Si todavía no la leíste en esta sesión, llamá a `ugly_guide`.
2. **Contexto.** Reuní todo lo relevante antes de escribir: lo que ya se habló en este chat, tu memoria, el
   CLAUDE.md y los docs del proyecto actual (oferta, precios, fechas, promos vigentes, reglas de marca y de
   nomenclatura), y cualquier archivo o link que mencione el usuario. Si faltan datos clave (qué se vende, precio
   u oferta, fecha, público, CTA) preguntá en un solo mensaje. No inventes datos.
3. **Comunicación.** Proponé el ángulo en una línea y **3 variantes de copy** ya divididas en bloques (título /
   soporte / beneficios / oferta / CTA) con los saltos de línea pensados. Indicá el color de cada burbuja.
   **Esperá a que el usuario elija o ajuste** antes de seguir.
4. **Footage.** Si no hay link de Drive o carpeta en el pedido ni guardado (`ugly_last` muestra la última
   fuente), pedilo. Llamá a `ugly_footage`, mirá la hoja de miniaturas y elegí los 1-3 clips que mejor
   acompañen el mensaje. Explicá en una línea por qué.
5. **Ubicación.** `ugly_inspect` sobre el mejor candidato. Decidí `position`, `start` y `dim` según las franjas
   menos cargadas, sin tapar caras ni la acción y fuera de las zonas rojas.
6. **Preview.** `ugly_preview` con el spec completo. Revisá la imagen con ojo crítico (legibilidad en 2 s, nada
   tapado, nada en zona roja, líneas parejas) y corregí antes de mostrarlo. Mostrale el preview al usuario.
7. **Render.** Con el OK (o directo si el usuario pidió no frenar), `ugly_render` con música aleatoria del mood
   que encaje. Al terminar, pasá la ruta del MP4, el tema que sonó y recordá los comandos para cambios:
   `/ugly-ads:texto`, `/ugly-ads:video`, `/ugly-ads:musica`, `/ugly-ads:estilo`, `/ugly-ads:variantes`.
