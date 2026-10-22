---
name: ugly-ads
description: Crear o editar ugly ads (videos verticales con texto fijo estilo Instagram sobre un clip de fondo y música) con el MCP ugly-ads. Usar cuando el usuario pida un ugly ad, un video con burbujas de texto de Instagram/Edits, "un story con texto encima" para pauta, o variantes de uno.
---
Para cualquier pedido de ugly ad usá las herramientas `ugly_*` del MCP `ugly-ads` siguiendo el flujo de
`/ugly-ads:crear`: primero `ugly_guide`, después contexto y copy aprobado por el usuario, y recién ahí
`ugly_footage` → `ugly_scan` (cortar el clip donde está la acción) → `ugly_inspect` → `ugly_preview` →
`ugly_render`.

Para cambios sobre un ugly ad que ya existe, arrancá con `ugly_last` y cambiá solo lo pedido.
Nunca inventes precios, fechas ni beneficios: sacalos del contexto del proyecto o preguntá.
