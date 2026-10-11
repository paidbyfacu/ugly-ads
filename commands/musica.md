---
description: Cambiar la música del último ugly ad (otro tema aleatorio, un mood o un tema puntual)
argument-hint: "[vacío = otro aleatorio | mood (hiphop, epico, chill…) | nombre de tema | ruta a mp3]"
---
Cambio de música en el último ugly ad. Pedido: $ARGUMENTS

- Si el pedido está vacío o dice "otra": `ugly_render` pasando solo `music: { "track": "random" }` (mantiene el
  mood anterior si lo había y evita repetir el mismo tema).
- Si es un mood: `music: { "track": "random", "mood": "<mood>" }`. Si dudás qué moods hay, `ugly_music`.
- Si nombra un tema o una ruta a mp3: `music: { "track": "<id, nombre o ruta>" }`.
- Si pide subir/bajar volumen o sumar el audio original: `volume` (0-1.5) / `original_audio` (0-1).

No toques texto ni video. Pasá la ruta del nuevo MP4 y el nombre del tema que sonó.
