---
description: Cambiar el tramo del video de fondo del último ugly ad (desde qué segundo hasta cuál)
argument-hint: "[ej. 'que arranque cuando levanta la pesa', 'del 0:12 al 0:24', 'más corto, 10 s']"
---
Cambio del corte del video de fondo en el último ugly ad. Pedido: $ARGUMENTS

1. `ugly_last` para traer el spec actual (clip, `start`, `end`).
2. Si el pedido trae segundos exactos, usalos. Si describe un momento ("cuando levanta la pesa"), corré
   `ugly_scan` sobre el clip con `target` = duración pedida (o la actual) y buscá ese momento en la hoja.
3. Contale al usuario el corte nuevo en una línea. Si cambió mucho lo que se ve, `ugly_inspect` sobre el tramo
   nuevo y reubicá el texto si hace falta.
4. `ugly_preview`, revisá y `ugly_render` manteniendo texto, estilo y música. Pasá la ruta del video.
