---
description: Generar varias versiones del último ugly ad para testear (otros hooks, clips, colores y temas)
argument-hint: "[cantidad (default 3) y qué variar: hook, clip, colores, música]"
---
Variantes del último ugly ad para test A/B. Pedido: $ARGUMENTS

1. `ugly_last` para traer el spec base. Si no dice cantidad, hacé 3.
2. Si no dice qué variar, cambiá **una variable fuerte por versión** para que el test sea legible: (a) otro hook
   en el título, (b) otro clip de la misma carpeta, (c) otra combinación de colores. Contale al usuario el plan
   en una lista corta antes de renderizar.
3. Para cada variante: `ugly_preview` (revisá), después `ugly_render` con `name` descriptivo
   (ej. `calistenia-v2-hook-precio`) y música aleatoria distinta.
4. Al final, tabla con: archivo · qué cambia · tema musical.
