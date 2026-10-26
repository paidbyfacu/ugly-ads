# CLAUDE.md — Ugly Ads

MCP + plugin de Claude Code que genera ugly ads. Ver `README.md` para instalación y estructura.

## Trabajo compartido entre agentes — SIEMPRE sincronizar con GitHub

Este repo lo editan varios agentes de Claude (en distintas sesiones o PCs) además del usuario. GitHub es la fuente de verdad, no la copia local. Para no pisarse:

1. **Antes de tocar nada:** `git pull --rebase`. Nunca editar sobre una copia desactualizada.
2. **Después de cada cambio:** commit chico y descriptivo, `git pull --rebase` y `git push` a `main`, sin preguntar.
3. **Agregar solo lo que tocaste** (`git add <archivo>`, no `git add -A`): puede haber trabajo sin commitear de otro agente o del usuario.
4. **Conflictos:** resolverlos conservando los cambios del otro; si no está claro cuál vale, preguntar al usuario. Nunca `push --force` ni `reset --hard` sobre trabajo ajeno.
5. **Nada de secretos:** no subir `.env`, keys, tokens ni datos privados; si aparecen, sumarlos a `.gitignore` y avisar.
6. **Este CLAUDE.md es la memoria compartida:** toda regla, decisión o dato nuevo del proyecto se anota acá (o en el doc que este archivo indique) y se pushea, así el otro agente lo ve. No dejar contexto del proyecto solo en la memoria local de una sesión.
