# Ugly Ads para Claude

Generá **ugly ads** con tu propio Claude: un clip de fondo (de tu carpeta de Google Drive), texto **fijo** encima
con las burbujas de Instagram/Edits y música libre de derechos. Sin abrir Edits ni CapCut.

Claude se encarga de todo el proceso: lee el contexto (el chat, tu memoria y los docs del proyecto), te propone el
copy, elige el clip que mejor acompaña el mensaje, ubica el texto donde no tapa la acción ni la UI de Instagram,
te muestra un preview y renderiza el MP4 final en 1080×1920.

→ Guía completa: https://paidbyfacu.com/herramientas/ugly-ads

## Requisitos

- **Node.js 18+** · https://nodejs.org
- **ffmpeg** · Windows: `winget install Gyan.FFmpeg` · Mac: `brew install ffmpeg` · Linux: `sudo apt install ffmpeg`
- **Google Chrome o Microsoft Edge** (se usa en modo invisible para dibujar las burbujas)

## Instalación

### Claude Code (recomendado: trae los comandos `/`)

```
/plugin marketplace add matsitox/ugly-ads
/plugin install ugly-ads@paidbyfacu
```

Reiniciá Claude Code y corré `/ugly-ads:setup` para verificar.

### Claude Desktop

Settings → Developer → Edit Config, y sumá:

```json
{
  "mcpServers": {
    "ugly-ads": {
      "command": "npx",
      "args": ["-y", "github:matsitox/ugly-ads"]
    }
  }
}
```

En Windows, si no arranca, usá `"command": "cmd"` y `"args": ["/c", "npx", "-y", "github:matsitox/ugly-ads"]`.
Los comandos aparecen en el botón **+ → Ugly Ads**.

### Claude Code solo con el MCP (sin plugin)

```
claude mcp add ugly-ads -- npx -y github:matsitox/ugly-ads
```

## Comandos

| Comando | Qué hace |
|---|---|
| `/ugly-ads:crear [promo + link de Drive]` | Todo el flujo: contexto → copy → clip → ubicación → preview → render |
| `/ugly-ads:texto [cambio]` | Cambia el copy del último ugly ad |
| `/ugly-ads:video [nº, criterio o link]` | Cambia el clip de fondo y reubica el texto |
| `/ugly-ads:musica [mood, tema o vacío]` | Otro tema (aleatorio, por mood o puntual) |
| `/ugly-ads:estilo [cambio]` | Colores, fuente, tamaño, posición |
| `/ugly-ads:variantes [n]` | Versiones para test A/B |
| `/ugly-ads:setup` | Verifica la instalación |

También podés pedirlo con tus palabras: *"haceme un ugly ad para la promo de octubre con los videos de esta
carpeta: <link>"*.

## Videos de fondo

Pasá el link de una carpeta de Google Drive compartida como **"Cualquier persona con el enlace" → Lector**.
Se leen hasta 2 niveles de subcarpetas. También sirve una carpeta local (`C:\videos\gym` o `~/Movies/broll`).
Los clips se descargan una sola vez y quedan en caché.

Opcional: con la variable `GOOGLE_API_KEY` (Drive API) el listado usa la API oficial en lugar de la vista pública.

## Música

Incluye 25 temas de [FreePD](https://archive.org/details/freepd) (Kevin MacLeod y otros), **dominio público
(CC0)**: se pueden usar en anuncios sin atribución. Moods: hiphop, gym, energía, electrónica, funk, alegre,
épico, chill, motivacional. Para sumar los tuyos, poné mp3 en `~/UglyAds/musica` (mood `propia`).

## Fuentes y emojis

- `font: "instagram"` usa **Instagram Sans** si la tenés instalada (se descarga gratis desde los recursos de marca
  de Instagram); si no, Figtree, la alternativa libre más parecida. `font: "poppins"` usa Poppins.
- Emojis estilo Apple (como en Instagram) desde `emoji-datasource-apple`, con Twemoji de respaldo
  (`emoji_style: "twemoji"`).

## Dónde quedan los videos

`~/UglyAds/AAAA-MM-DD/<nombre>.mp4`, junto a un `.json` con el spec para rehacerlo o editarlo.
La carpeta se cambia con la variable `UGLY_ADS_DIR`.

## Cómo funciona

MCP por stdio sin dependencias de npm. La capa de texto se arma en HTML/CSS (burbujas con
`box-decoration-break`, degradés, emojis como imagen) y la dibuja Chrome headless a un PNG transparente. ffmpeg
recorta el clip a 9:16, lo oscurece un poco, superpone la capa y mezcla la música. Para elegir dónde va el texto,
el MCP le pasa a Claude una tira de fotogramas con las zonas de UI marcadas y un análisis de movimiento y detalle
por franja.

## Licencia

MIT · Hecho por [@paidbyfacu](https://instagram.com/paidbyfacu)
