---
description: Cambiar el video de fondo del último ugly ad
argument-hint: "[número de clip, criterio (ej. 'alguien en barras') o nuevo link de Drive]"
---
Cambio de video de fondo en el último ugly ad. Pedido: $ARGUMENTS

1. `ugly_last` para traer el spec actual.
2. Si el pedido trae un número de clip, usalo. Si trae un link nuevo, llamá a `ugly_footage` con ese link. Si es
   un criterio, llamá a `ugly_footage` (sin source reutiliza la última carpeta), mirá las miniaturas y elegí el
   clip que mejor cumpla, distinto del actual.
3. `ugly_inspect` sobre el clip nuevo y reubicá el texto (`position`, `start`, `dim`) para no tapar la acción.
4. `ugly_preview`, revisá y después `ugly_render` manteniendo texto, estilo y música. Pasá la ruta del video.
