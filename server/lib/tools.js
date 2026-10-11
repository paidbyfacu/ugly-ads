// Herramientas MCP del generador de ugly ads.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WORK_DIR, ensureDirs, tmpFile, exists, slug, clamp, normPath } from "./util.js";
import { findDeps, installHints } from "./deps.js";
import { normalizeSpec, renderOverlay, PALETTE, SAFE_ZONES, FORMATS } from "./overlay.js";
import { probe, analyzeBands, previewFrame, renderVideo } from "./video.js";
import { listFootage, contactSheet, ensureLocal, clipStrip, parseDrive } from "./footage.js";
import { listTracks, pickTrack, ensureTrack, MUSIC_INFO } from "./music.js";
import { getState, saveState } from "./state.js";
import { fontCss } from "./fonts.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const GUIDE = fs.readFileSync(path.join(here, "../guide.md"), "utf8");

const text = (t) => ({ type: "text", text: typeof t === "string" ? t : JSON.stringify(t, null, 1) });
async function image(file) {
  const data = (await fsp.readFile(file)).toString("base64");
  return { type: "image", data, mimeType: file.endsWith(".png") ? "image/png" : "image/jpeg" };
}

async function resolveClip(ref) {
  if (ref === undefined || ref === null || ref === "") throw new Error("Falta `clip` (número de la lista de ugly_footage, link/ID de Drive o ruta local).");
  const st = getState();
  if (typeof ref === "number" || /^\d{1,4}$/.test(String(ref))) {
    const c = st.clips[Number(ref) - 1];
    if (!c) throw new Error(`No hay clip #${ref}. Corré ugly_footage primero (hay ${st.clips.length} en la lista).`);
    return c;
  }
  const d = parseDrive(ref);
  if (d?.type === "file") return st.clips.find((c) => c.id === d.id) || { kind: "drive", id: d.id, name: d.id };
  if (/^[\w-]{25,}$/.test(String(ref))) return st.clips.find((c) => c.id === ref) || { kind: "drive", id: String(ref), name: String(ref) };
  const p = normPath(ref);
  if (await exists(p)) return { kind: "local", path: p, name: path.basename(p) };
  const byName = st.clips.find((c) => c.name === ref || c.name.endsWith("/" + ref));
  if (byName) return byName;
  throw new Error(`No pude resolver el clip "${ref}".`);
}

const stableRef = (c) => (c.kind === "drive" ? c.id : c.path);

async function clipReady(ref) {
  const clip = await resolveClip(ref);
  const file = await ensureLocal(clip);
  const info = await probe(file);
  return { clip, file, info };
}

function timing(spec, info) {
  const start = clamp(Number(spec.start) || 0, 0, Math.max(0, info.duration - 0.5));
  const want = Number(spec.duration) || clamp(info.duration - start, 6, 15);
  return { start, duration: clamp(want, 2, 60) };
}

function outputPath(spec, name) {
  const day = new Date().toISOString().slice(0, 10);
  const dir = path.join(WORK_DIR, day);
  fs.mkdirSync(dir, { recursive: true });
  const base = slug(name || spec.name || spec.blocks.map((b) => b.text).join(" ").replace(/\*\*/g, ""), 42);
  let p = path.join(dir, base + ".mp4");
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${base}-${i}.mp4`);
  return p;
}

// ---------------------------------------------------------------- definiciones

const SPEC_SCHEMA = {
  type: "object",
  description: "Spec del ugly ad. Ver ugly_guide para todos los campos y ejemplos.",
  properties: {
    clip: { description: "Número de clip de ugly_footage, link/ID de Drive o ruta local." },
    start: { type: "number", description: "Segundo del clip donde arranca (default 0)." },
    duration: { type: "number", description: "Duración final en segundos (default: largo del clip, entre 6 y 15). Si el clip es más corto, se repite en loop." },
    format: { type: "string", enum: Object.keys(FORMATS), description: "Default 9:16 (Reels/Stories)." },
    safe_zone: { type: "string", enum: Object.keys(SAFE_ZONES), description: "Zonas que tapa la UI. Default reels." },
    position: { description: "top | center | bottom | número 0-1 (centro vertical del bloque de texto)." },
    align: { type: "string", enum: ["center", "left", "right"] },
    font: { type: "string", enum: ["instagram", "poppins"], description: "instagram = Instagram Sans si está instalada, si no Figtree." },
    text_scale: { type: "number", description: "Multiplicador del tamaño de todo el texto (default 1)." },
    gap: { type: "number", description: "Espacio entre bloques en múltiplos del tamaño base (default 0.55)." },
    dim: { type: "number", description: "Oscurecido del video 0-0.85 (default 0.2)." },
    emoji_style: { type: "string", enum: ["apple", "twemoji"] },
    blocks: {
      type: "array",
      description: "Bloques de texto de arriba hacia abajo.",
      items: {
        type: "object",
        properties: {
          style: { type: "string", enum: ["title", "bubble", "plain"] },
          text: { type: "string", description: "\\n para cortar línea, **negrita**, emojis directo." },
          bg: { type: "string", description: `Fondo de la burbuja: ${Object.keys(PALETTE).join(", ")} o #hex.` },
          color: { type: "string", description: "Color del texto (auto según el fondo si se omite)." },
          gradient: { type: "array", items: { type: "string" }, description: "Solo title: colores del degradé." },
          size: { description: "xs | s | m | l | xl | xxl o número." },
          opacity: { type: "number", description: "Solo bubble: opacidad del fondo 0.2-1." },
        },
        required: ["text"],
      },
    },
    music: {
      type: "object",
      properties: {
        track: { type: "string", description: "id/título del tema, ruta a un mp3, \"random\" o \"none\"." },
        mood: { type: "string", description: "Filtra el tema aleatorio: hiphop, gym, energia, electronica, funk, alegre, epico, chill, motivacional, propia..." },
        volume: { type: "number", description: "0-1.5, default 0.8." },
        start: { type: "number", description: "Segundo del tema donde arranca (default: automático, salta intros)." },
        original_audio: { type: "number", description: "Volumen del audio original del clip 0-1 (default 0)." },
      },
    },
    name: { type: "string", description: "Nombre del archivo de salida (opcional)." },
    preview_at: { type: "number", description: "Segundo del clip para el preview (default 40% del tramo)." },
  },
  required: ["blocks"],
};

export const TOOLS = [
  {
    name: "ugly_guide",
    description: "Guía del método ugly ads: cómo escribir el copy, estilos de bloque, colores, zonas seguras y formato del spec con ejemplos. Leela antes de crear el primer ugly ad de la sesión.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ugly_setup",
    description: "Verifica que estén ffmpeg y Chrome/Edge, crea la carpeta de trabajo y precarga fuentes. Usalo si algo falla o la primera vez.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ugly_footage",
    description: "Lista los videos de una carpeta de Google Drive (link compartido como 'cualquier persona con el enlace') o de una carpeta local, y devuelve una hoja de miniaturas numeradas para elegir el clip que mejor acompaña el mensaje. Sin `source` reutiliza la última fuente.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "Link de carpeta de Drive, link de un archivo de Drive o ruta local." },
        page: { type: "number", description: "Página de miniaturas (24 por página)." },
        refresh: { type: "boolean", description: "Volver a leer la carpeta aunque sea la misma fuente." },
      },
    },
  },
  {
    name: "ugly_inspect",
    description: "Analiza un clip: lo descarga si es de Drive, devuelve duración/orientación, una tira de fotogramas con las zonas de UI en rojo y líneas cada 10%, y qué franjas tienen menos movimiento/detalle. Usalo para decidir `position`, `start` y si el texto tapa caras o la acción.",
    inputSchema: {
      type: "object",
      properties: {
        clip: { description: "Número de clip, link/ID de Drive o ruta." },
        start: { type: "number" },
        length: { type: "number", description: "Tramo a analizar en segundos (default: todo el clip)." },
        format: { type: "string", enum: Object.keys(FORMATS) },
        safe_zone: { type: "string", enum: Object.keys(SAFE_ZONES) },
      },
      required: ["clip"],
    },
  },
  {
    name: "ugly_preview",
    description: "Renderiza un fotograma del ugly ad (video + texto) con las zonas de UI marcadas, para revisar legibilidad y ubicación antes del render final. Devuelve la imagen, métricas de layout y advertencias. Guarda el spec como borrador.",
    inputSchema: { type: "object", properties: { spec: SPEC_SCHEMA, guides: { type: "boolean", description: "Marcar zonas de UI (default true)." } }, required: ["spec"] },
  },
  {
    name: "ugly_render",
    description: "Renderiza el MP4 final (1080×1920 por default) con el texto fijo encima y música de fondo. Sin `spec` usa el último borrador/render; podés pasar solo `music` para cambiar el tema sin tocar nada más.",
    inputSchema: {
      type: "object",
      properties: {
        spec: SPEC_SCHEMA,
        music: SPEC_SCHEMA.properties.music,
        name: { type: "string" },
      },
    },
  },
  {
    name: "ugly_music",
    description: "Lista la biblioteca de música (libre de derechos, dominio público, apta para anuncios) y los temas propios de ~/UglyAds/musica. Filtrable por mood.",
    inputSchema: { type: "object", properties: { mood: { type: "string" } } },
  },
  {
    name: "ugly_last",
    description: "Devuelve el último spec usado (borrador o render) y la ruta del último video, para hacer cambios sobre lo que ya existe.",
    inputSchema: { type: "object", properties: {} },
  },
];

// ---------------------------------------------------------------- implementación

const handlers = {
  async ugly_guide() {
    return [text(GUIDE)];
  },

  async ugly_setup() {
    await ensureDirs();
    const d = await findDeps();
    const h = installHints();
    const fonts = (await fontCss()) ? "ok (Poppins + Figtree en caché)" : "sin conexión: se usan fuentes del sistema";
    const lines = [
      `Carpeta de trabajo: ${WORK_DIR}`,
      `ffmpeg: ${d.ffmpeg || "FALTA → " + h.ffmpeg}`,
      `ffprobe: ${d.ffprobe || "FALTA → " + h.ffmpeg}`,
      `Navegador para render: ${d.chrome || "FALTA → " + h.chrome}`,
      `Fuentes: ${fonts}`,
      `Música propia: poné mp3 en ${MUSIC_INFO.own_dir}`,
      `Node: ${process.version}`,
    ];
    return [text(lines.join("\n"))];
  },

  async ugly_footage({ source, page = 1, refresh = false }) {
    const st = getState();
    const src = source || st.source;
    if (!src) throw new Error("Pasame `source`: el link de la carpeta de Google Drive (o una carpeta local).");
    let clips = st.clips;
    if (refresh || src !== st.source || !clips.length) {
      clips = await listFootage(src);
      saveState({ source: src, clips });
    }
    if (!clips.length) return [text("No encontré videos en esa fuente (mp4, mov, m4v, webm, mkv).")];
    const sheet = await contactSheet(clips, { page });
    const list = clips.slice((page - 1) * 24, page * 24).map((c) => `${c.n}. ${c.name}${c.duration ? ` (${Math.round(c.duration)}s)` : ""}`).join("\n");
    saveState({ clips });
    return [
      text(`${clips.length} clips en la fuente${sheet.pages > 1 ? ` · página ${page}/${sheet.pages}` : ""}.\n${list}\n\nElegí 1-3 candidatos que acompañen el mensaje y miralos con ugly_inspect.`),
      await image(sheet.file),
    ];
  },

  async ugly_inspect({ clip, start = 0, length, format = "9:16", safe_zone }) {
    const { clip: c, file, info } = await clipReady(clip);
    const zoneKey = SAFE_ZONES[safe_zone] ? safe_zone : format === "9:16" ? "reels" : "feed";
    const strip = await clipStrip(file, info, { format, zone: SAFE_ZONES[zoneKey], start, length });
    const bands = await analyzeBands(file, { duration: info.duration, format, safe_zone: zoneKey, start, length: length || info.duration - start });
    const notes = [];
    if (info.orientation === "horizontal") notes.push("Clip horizontal: se recorta al centro para 9:16; revisá que la acción quede adentro.");
    if (info.duration < 6) notes.push(`Dura ${info.duration.toFixed(1)}s: se va a repetir en loop para llegar a la duración pedida.`);
    return [
      text({ clip: c.n ? `#${c.n} ${c.name}` : c.name, duracion_s: +info.duration.toFixed(2), resolucion: `${info.width}x${info.height}`, orientacion: info.orientation, audio_original: info.hasAudio, zona_segura: zoneKey, ...bands, notas: notes }),
      await image(strip),
    ];
  },

  async ugly_preview({ spec: raw, guides = true }) {
    const { spec, warnings } = normalizeSpec(raw);
    const { clip, file, info } = await clipReady(spec.clip);
    const { start, duration } = timing(spec, info);
    const ov = tmpFile("png");
    const r = await renderOverlay(spec, ov, { guides });
    const t = spec.preview_at !== undefined ? Number(spec.preview_at) : start + Math.min(duration, info.duration - start) * 0.4;
    const out = tmpFile("jpg");
    await previewFrame({ clip: file, t, overlay: ov, dim: spec.dim, format: spec.format, out });
    fsp.unlink(ov).catch(() => {});
    if (r.metrics?.scale < 1) warnings.push(`El texto no entraba en la zona segura y la letra se achicó al ${Math.round(r.metrics.scale * 100)}%. Mejor recortar copy que achicar.`);
    for (const b of r.metrics?.blocks || []) if (b.orphan) warnings.push(`Bloque ${b.i}: la última línea quedó con una sola palabra. Reacomodá los \n.`);
    if (r.metrics && !r.metrics.fonts.some((f) => /Instagram|Figtree|Poppins/.test(f))) warnings.push("No cargaron las fuentes (¿sin internet?): se usó la del sistema.");
    saveState({ draft: { ...raw, clip: stableRef(clip), clip_name: clip.name } });
    return [
      text({ advertencias: warnings, layout: r.metrics && { top_px: r.metrics.top, bottom_px: r.metrics.bottom, alto_px: r.metrics.height, escala: r.metrics.scale, lineas_por_bloque: r.metrics.blocks.map((b) => b.lines) }, tramo: { start, duration }, nota: "Las franjas rojas son la UI de Instagram: no van en el video final." }),
      await image(out),
    ];
  },

  async ugly_render({ spec: raw, music, name }) {
    const st = getState();
    raw = raw || st.draft || st.last?.spec;
    if (!raw) throw new Error("No hay spec. Pasá `spec` o generá un preview primero.");
    raw = JSON.parse(JSON.stringify(raw));
    if (music) raw.music = { ...(raw.music || {}), ...music };
    const { spec, warnings } = normalizeSpec(raw);
    const { clip, file, info } = await clipReady(spec.clip);
    const { start, duration } = timing(spec, info);
    const m = spec.music || {};
    let track = null;
    if (m.track !== "none") {
      track = await ensureTrack(await pickTrack({ track: m.track, mood: m.mood, exclude: music ? st.last?.music?.id : undefined }));
    }
    const ov = tmpFile("png");
    await renderOverlay(spec, ov);
    const out = outputPath(spec, name);
    const musicCfg = {
      file: track?.file,
      start: m.start !== undefined ? Number(m.start) : track?.auto_start || 0,
      volume: clamp(Number(m.volume ?? 0.8), 0, 1.5),
      original_audio: clamp(Number(m.original_audio ?? 0), 0, 1.5),
    };
    await renderVideo({ clip: file, clipInfo: info, overlay: ov, format: spec.format, dim: spec.dim, start, duration, music: musicCfg, out });
    fsp.unlink(ov).catch(() => {});
    // El spec guardado fija el tema elegido, así "cambiar el texto" no cambia la música.
    const saved = { ...raw, clip: stableRef(clip), clip_name: clip.name, music: { ...(raw.music || {}), ...(track ? { track: track.id, start: musicCfg.start } : { track: "none" }) } };
    await fsp.writeFile(out.replace(/\.mp4$/, ".json"), JSON.stringify(saved, null, 1), "utf8");
    saveState({ last: { spec: saved, output: out, music: track && { id: track.id, title: track.title } }, draft: null, history: [{ output: out, at: new Date().toISOString() }, ...st.history].slice(0, 50) });
    return [
      text({
        video: out,
        duracion_s: duration,
        clip: clip.n ? `#${clip.n} ${clip.name}` : clip.name,
        musica: track ? `${track.title} (${track.id}) desde ${musicCfg.start}s` : "sin música",
        advertencias: warnings,
        siguiente: "Pedí cambios con /ugly-ads:texto, /ugly-ads:video, /ugly-ads:musica o /ugly-ads:estilo.",
      }),
    ];
  },

  async ugly_music({ mood }) {
    const tracks = await listTracks(mood);
    const moods = [...new Set((await listTracks()).flatMap((t) => t.moods))].sort();
    return [text({ licencia: MUSIC_INFO.license, fuente: MUSIC_INFO.source, musica_propia: MUSIC_INFO.own_dir, moods, temas: tracks.map((t) => `${t.id} · ${t.title} [${t.moods.join(", ")}]`) })];
  },

  async ugly_last() {
    const st = getState();
    return [text({ ultimo_video: st.last?.output || null, ultimo_spec: st.last?.spec || null, borrador: st.draft || null, fuente_clips: st.source || null })];
  },
};

export async function callTool(name, args) {
  const h = handlers[name];
  if (!h) throw new Error(`Herramienta desconocida: ${name}`);
  await ensureDirs();
  return h(args || {});
}
