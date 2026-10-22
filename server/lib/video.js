// ffmpeg/ffprobe: metadatos, fotogramas, análisis de zonas "tranquilas" y render final.
import path from "node:path";
import { requireDeps } from "./deps.js";
import { runOk, run, clamp } from "./util.js";
import { FORMATS, SAFE_ZONES } from "./overlay.js";

export async function probe(file) {
  const { ffprobe } = await requireDeps("ffprobe");
  const r = await runOk(ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const j = JSON.parse(r.stdout);
  const v = j.streams.find((s) => s.codec_type === "video");
  if (!v) throw new Error(`"${path.basename(file)}" no tiene pista de video.`);
  let w = v.width, h = v.height;
  const rot = Math.abs(Number(v.tags?.rotate || v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation || 0));
  if (rot === 90 || rot === 270) [w, h] = [h, w];
  const [n, d] = String(v.avg_frame_rate || v.r_frame_rate || "30/1").split("/").map(Number);
  return {
    duration: Number(j.format.duration || v.duration || 0),
    width: w,
    height: h,
    fps: d ? +(n / d).toFixed(2) : 30,
    hasAudio: j.streams.some((s) => s.codec_type === "audio"),
    orientation: h > w * 1.1 ? "vertical" : w > h * 1.1 ? "horizontal" : "cuadrado",
    // iPhone y muchos celulares graban en HDR (HLG/PQ, BT.2020): hay que pasarlo a SDR o los colores se lavan.
    hdr: ["arib-std-b67", "smpte2084"].includes(v.color_transfer) || v.color_primaries === "bt2020",
  };
}

const probes = new Map();
export async function probeCached(file) {
  if (!probes.has(file)) probes.set(file, await probe(file));
  return probes.get(file);
}

let zscaleOk = null;
async function hasZscale() {
  if (zscaleOk !== null) return zscaleOk;
  const { ffmpeg } = await requireDeps("ffmpeg");
  const r = await run(ffmpeg, ["-hide_banner", "-filters"]);
  return (zscaleOk = / zscale /.test(r.stdout) && / tonemap /.test(r.stdout));
}

/** Escala y recorta a W×H; si el clip es HDR lo convierte a SDR BT.709 (después de achicar, así es rápido). */
async function cover(W, H, info) {
  let f = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;
  if (info?.hdr && (await hasZscale())) {
    f += ",zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv";
  }
  return f + ",format=yuv420p";
}

const SDR_TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"];

/** Extrae un fotograma (JPG) en el segundo t, recortado al formato W×H. */
export async function frameAt(file, t, out, W = 540, H = 960) {
  const { ffmpeg } = await requireDeps("ffmpeg");
  const vf = await cover(W, H, await probeCached(file));
  await runOk(ffmpeg, ["-v", "error", "-y", "-ss", String(Math.max(0, t)), "-i", file, "-frames:v", "1", "-vf", vf, "-q:v", "3", out]);
  return out;
}

/**
 * Escaneo completo del clip en UNA sola decodificación:
 * - actividad (movimiento) segundo a segundo, para encontrar dónde pasa la acción;
 * - `n` fotogramas repartidos a lo largo de todo el clip, para la línea de tiempo.
 * Devuelve { porSegundo: [0-100], ventanas: mejores tramos de `length` s, frames: [{ t, file }] }.
 */
export async function scanClip(file, info, { length = 12, n = 12, prefix, W = 180, H = 320 } = {}) {
  const { ffmpeg } = await requireDeps("ffmpeg");
  const fps = info.duration > 120 ? 1 : 2;
  const w = 32, h = 32;
  const step = info.duration / n;
  const fc = `[0:v]split=2[a][b];[a]fps=${fps},scale=${w}:${h},format=gray[act];` +
    `[b]fps=1/${step.toFixed(4)}:start_time=${(step / 2).toFixed(3)},${await cover(W, H, info)}[tl]`;
  const r = await run(ffmpeg, [
    "-v", "error", "-y", "-i", file, "-filter_complex", fc,
    "-map", "[tl]", "-frames:v", String(n), "-q:v", "4", `${prefix}%02d.jpg`,
    "-map", "[act]", "-f", "rawvideo", "pipe:1",
  ], { binary: true, timeout: 10 * 60 * 1000 });
  if (r.code !== 0) throw new Error(`ffmpeg falló al escanear el clip:\n${r.stderr.slice(-1200)}`);
  const fsz = w * h, frames = Math.floor(r.stdout.length / fsz);
  const diff = [0];
  for (let f = 1; f < frames; f++) {
    let d = 0;
    for (let i = 0; i < fsz; i++) d += Math.abs(r.stdout[f * fsz + i] - r.stdout[(f - 1) * fsz + i]);
    diff.push(d / fsz);
  }
  const secs = Math.max(1, Math.ceil(info.duration));
  const per = Array.from({ length: secs }, (_, s) => {
    const a = diff.slice(s * fps, (s + 1) * fps);
    return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  });
  const max = Math.max(...per, 0.001);
  const norm = per.map((v) => Math.round((100 * v) / max));
  const L = Math.min(Math.max(2, Math.round(length)), secs);
  const wins = [];
  for (let s = 0; s + L <= secs; s++) wins.push({ start: s, end: s + L, actividad: Math.round(norm.slice(s, s + L).reduce((a, b) => a + b, 0) / L) });
  wins.sort((a, b) => b.actividad - a.actividad);
  const top = [];
  for (const w of wins) if (top.every((t) => w.end <= t.start || w.start >= t.end)) { top.push(w); if (top.length === 3) break; }
  return {
    porSegundo: norm,
    ventanas: top,
    frames: Array.from({ length: n }, (_, i) => ({ t: +(step / 2 + i * step).toFixed(1), file: `${prefix}${String(i + 1).padStart(2, "0")}.jpg` })),
  };
}

/**
 * Analiza en qué franjas horizontales del video hay menos movimiento y detalle,
 * para ubicar el texto ahí. Devuelve franjas con puntaje 0-100 (más alto = más cargado).
 */
export async function analyzeBands(file, { duration, format = "9:16", safe_zone = "reels", start = 0, length } = {}) {
  const { ffmpeg } = await requireDeps("ffmpeg");
  const [FW, FH] = FORMATS[format] || FORMATS["9:16"];
  const w = 54, h = Math.round((54 * FH) / FW);
  const span = Math.max(1, (length || duration || 10));
  const N = 10;
  const r = await run(ffmpeg, [
    "-v", "error", "-ss", String(start), "-t", String(span), "-i", file,
    "-vf", `fps=${(N / span).toFixed(4)},${await cover(w, h, await probeCached(file))},format=gray`,
    "-frames:v", String(N), "-f", "rawvideo", "-",
  ], { binary: true });
  const buf = r.stdout;
  const fsz = w * h;
  const frames = Math.floor(buf.length / fsz);
  if (!frames) return null;
  const BANDS = 12;
  const rowsPer = h / BANDS;
  const bands = [];
  for (let b = 0; b < BANDS; b++) {
    const y0 = Math.floor(b * rowsPer), y1 = Math.floor((b + 1) * rowsPer);
    let edge = 0, motion = 0, sum = 0, sum2 = 0, n = 0, nm = 0;
    for (let f = 0; f < frames; f++) {
      const o = f * fsz;
      for (let y = y0; y < y1; y++) {
        for (let x = 0; x < w; x++) {
          const i = o + y * w + x;
          const p = buf[i];
          sum += p; sum2 += p * p; n++;
          if (x + 1 < w) edge += Math.abs(p - buf[i + 1]);
          if (y + 1 < h) edge += Math.abs(p - buf[i + w]);
          if (f > 0) { motion += Math.abs(p - buf[i - fsz]); nm++; }
        }
      }
    }
    const mean = sum / n;
    bands.push({ edge: edge / n, motion: nm ? motion / nm : 0, mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) });
  }
  const maxE = Math.max(...bands.map((b) => b.edge), 1), maxM = Math.max(...bands.map((b) => b.motion), 1);
  const out = bands.map((b) => ({
    cargado: Math.round(100 * (0.55 * (b.edge / maxE) + 0.45 * (b.motion / maxM))),
    movimiento: Math.round(100 * (b.motion / maxM)),
    brillo: Math.round((b.mean / 255) * 100),
  }));
  // Mejor ventana para un bloque de texto que ocupe ~40% del alto, dentro de la zona segura.
  const z = SAFE_ZONES[safe_zone] || SAFE_ZONES.reels;
  const scoreAt = (y) => out[clamp(Math.floor(y * BANDS), 0, BANDS - 1)].cargado;
  const suggest = (frac) => {
    let best = null;
    for (let top = z.top; top + frac <= 1 - z.bottom + 1e-6; top += 0.02) {
      let s = 0, k = 0;
      for (let y = top; y < top + frac; y += 0.01) { s += scoreAt(y); k++; }
      const v = s / k;
      if (!best || v < best.score) best = { center_y: +(top + frac / 2).toFixed(2), score: Math.round(v) };
    }
    return best;
  };
  const franjas = out.map((b, i) => `${Math.round((i / BANDS) * 100)}-${Math.round(((i + 1) / BANDS) * 100)}%: cargado ${b.cargado} · movimiento ${b.movimiento} · brillo ${b.brillo}`);
  return { franjas, sugerencia_bloque_40: suggest(0.4), sugerencia_bloque_25: suggest(0.25), leyenda: "cargado/movimiento 0-100 relativo al clip (bajo = mejor para texto); brillo 0-100" };
}

/** Busca el primer momento "con energía" de un tema (evita intros silenciosas). */
export async function loudStart(file) {
  const { ffmpeg } = await requireDeps("ffmpeg");
  const r = await run(ffmpeg, [
    "-v", "error", "-t", "75", "-i", file, "-ac", "1", "-ar", "22050",
    "-af", "asetnsamples=n=11025,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
    "-f", "null", "-",
  ]);
  const vals = [];
  let t = 0;
  for (const line of r.stdout.split(/\r?\n/)) {
    const mt = /pts_time:([\d.]+)/.exec(line);
    if (mt) t = Number(mt[1]);
    const mv = /RMS_level=(-?[\d.]+|-inf)/.exec(line);
    if (mv) vals.push({ t, db: mv[1] === "-inf" ? -120 : Number(mv[1]) });
  }
  if (!vals.length) return 0;
  const max = Math.max(...vals.map((v) => v.db));
  const hit = vals.find((v) => v.db >= max - 6);
  return hit ? Math.max(0, +(hit.t - 0.1).toFixed(2)) : 0;
}

function dimFilter(dim) {
  return dim > 0 ? `,drawbox=x=0:y=0:w=iw:h=ih:color=black@${dim.toFixed(2)}:t=fill` : "";
}

/** Compone un fotograma de preview (video + oscurecido + capa). */
export async function previewFrame({ clip, t, overlay, dim, format, out, scale = 0.5 }) {
  const { ffmpeg } = await requireDeps("ffmpeg");
  const [W, H] = FORMATS[format];
  const cv = await cover(W, H, await probeCached(clip));
  await runOk(ffmpeg, [
    "-v", "error", "-y", "-ss", String(Math.max(0, t)), "-i", clip, "-i", overlay,
    "-filter_complex", `[0:v]${cv}${dimFilter(dim)}[b];[b][1:v]overlay=0:0,scale=${Math.round(W * scale)}:-2`,
    "-frames:v", "1", "-q:v", "3", out,
  ]);
  return out;
}

/** Render final: video de fondo + capa de texto fija + música. */
export async function renderVideo({ clip, clipInfo, overlay, format, dim, start, duration, music, out }) {
  const { ffmpeg } = await requireDeps("ffmpeg");
  const [W, H] = FORMATS[format];
  const avail = Math.max(0.5, clipInfo.duration - start);
  const loop = avail + 0.05 < duration;
  const args = ["-v", "error", "-y"];
  if (loop) args.push("-stream_loop", "-1");
  args.push("-ss", String(start), "-i", clip, "-loop", "1", "-framerate", "30", "-i", overlay);
  let fc = `[0:v]${await cover(W, H, clipInfo)},fps=30${dimFilter(dim)}[b];[b][1:v]overlay=0:0:shortest=0,format=yuv420p[v]`;
  const fadeOut = Math.min(1.2, duration / 4);
  const audio = [];
  let idx = 2;
  if (music?.file) {
    args.push("-stream_loop", "-1", "-ss", String(music.start || 0), "-i", music.file);
    audio.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${music.volume.toFixed(2)},afade=t=in:st=0:d=0.35,afade=t=out:st=${(duration - fadeOut).toFixed(2)}:d=${fadeOut.toFixed(2)}[m]`);
    idx++;
  }
  const orig = clipInfo.hasAudio && music?.original_audio > 0 ? music.original_audio : 0;
  if (orig) audio.push(`[0:a]aresample=48000,aformat=channel_layouts=stereo,volume=${orig.toFixed(2)}[o]`);
  if (music?.file && orig) audio.push(`[m][o]amix=inputs=2:duration=longest:normalize=0[a]`);
  else if (music?.file) audio.push(`[m]anull[a]`);
  else if (orig) audio.push(`[o]anull[a]`);
  else {
    args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
    audio.push(`[${idx}:a]anull[a]`);
  }
  fc += ";" + audio.join(";");
  args.push(
    "-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-t", duration.toFixed(2),
    "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-profile:v", "high", "-r", "30", ...SDR_TAGS,
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out
  );
  await runOk(ffmpeg, args, { timeout: 20 * 60 * 1000 });
  return out;
}
