// Fuentes de video: carpeta de Google Drive compartida por link (sin claves) o carpeta local.
import fsp from "node:fs/promises";
import path from "node:path";
import { CACHE_DIR, download, exists, fetchText, escapeHtml, fileUrl, tmpFile, runOk, normPath } from "./util.js";
import { requireDeps } from "./deps.js";
import { probe, frameAt } from "./video.js";
import { screenshot } from "./chrome.js";

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|mts)$/i;

export function parseDrive(ref) {
  const s = String(ref).trim();
  let m = /\/folders\/([\w-]{10,})/.exec(s);
  if (m) return { type: "folder", id: m[1] };
  m = /\/file\/d\/([\w-]{10,})/.exec(s) || /[?&]id=([\w-]{10,})/.exec(s);
  if (m) return { type: s.includes("folderview") ? "folder" : "file", id: m[1] };
  return null;
}

function decode(s) {
  return s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

async function listDriveFolderApi(id, key) {
  const out = [];
  let pageToken = "";
  do {
    const q = encodeURIComponent(`'${id}' in parents and trashed=false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&key=${key}&pageSize=1000&fields=nextPageToken,files(id,name,mimeType,videoMediaMetadata(durationMillis,width,height))${pageToken ? "&pageToken=" + pageToken : ""}`;
    const j = JSON.parse(await fetchText(url));
    for (const f of j.files || []) {
      out.push({
        id: f.id, name: f.name,
        folder: f.mimeType === "application/vnd.google-apps.folder",
        video: f.mimeType?.startsWith("video/") || VIDEO_EXT.test(f.name),
        duration: f.videoMediaMetadata?.durationMillis ? Number(f.videoMediaMetadata.durationMillis) / 1000 : undefined,
      });
    }
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return out;
}

async function listDriveFolderPublic(id) {
  const html = await fetchText(`https://drive.google.com/embeddedfolderview?id=${id}#list`);
  const out = [];
  const re = /<div class="flip-entry" id="entry-([\w-]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<img src="([^"]*)"[\s\S]*?<div class="flip-entry-title">([^<]*)<\/div>/g;
  let m;
  while ((m = re.exec(html))) {
    const [, fid, href, icon, title] = m;
    const name = decode(title);
    out.push({ id: fid, name, folder: href.includes("/folders/"), video: VIDEO_EXT.test(name) || /video/.test(icon) });
  }
  if (!out.length && /accounts\.google\.com|ServiceLogin/.test(html))
    throw new Error("La carpeta de Drive no es pública. Compartila como \"Cualquier persona con el enlace\" (lector).");
  return out;
}

async function listDrive(id, depth = 0) {
  const key = process.env.GOOGLE_API_KEY;
  const items = key ? await listDriveFolderApi(id, key) : await listDriveFolderPublic(id);
  let clips = items.filter((i) => !i.folder && i.video).map((i) => ({ kind: "drive", id: i.id, name: i.name, duration: i.duration }));
  if (depth < 2) {
    for (const f of items.filter((i) => i.folder)) {
      const sub = await listDrive(f.id, depth + 1);
      clips = clips.concat(sub.map((c) => ({ ...c, name: `${f.name}/${c.name}` })));
    }
  }
  return clips;
}

async function listLocal(dir, depth = 0, base = dir) {
  let out = [];
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 2 && !e.name.startsWith(".")) out = out.concat(await listLocal(p, depth + 1, base));
    else if (e.isFile() && VIDEO_EXT.test(e.name)) out.push({ kind: "local", path: p, name: path.relative(base, p).replace(/\\/g, "/") });
  }
  return out;
}

/** Lista los clips de una fuente (link de Drive o carpeta/archivo local). */
export async function listFootage(source) {
  const d = parseDrive(source);
  let clips;
  if (d?.type === "folder") clips = await listDrive(d.id);
  else if (d?.type === "file") clips = [{ kind: "drive", id: d.id, name: d.id }];
  else {
    const p = normPath(source);
    if (!(await exists(p))) throw new Error(`No encuentro "${source}". Pasá un link de carpeta de Google Drive o una carpeta local.`);
    const st = await fsp.stat(p);
    clips = st.isDirectory() ? await listLocal(p) : [{ kind: "local", path: p, name: path.basename(p) }];
  }
  clips.sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
  return clips.map((c, i) => ({ n: i + 1, ...c }));
}

async function driveDownload(id, dest) {
  const url = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
  try {
    await download(url, dest, { rejectHtml: true, retries: 2 });
  } catch (e) {
    if (!e.html) throw e;
    // Página de "no se pudo analizar por virus": reenviar el formulario de confirmación.
    const form = /<form[^>]+action="([^"]+)"[\s\S]*?<\/form>/.exec(e.html);
    if (!form) throw new Error("Drive no devolvió el archivo. ¿Está compartido como \"Cualquier persona con el enlace\"?");
    const params = new URLSearchParams();
    for (const m of form[0].matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)) params.set(m[1], decode(m[2]));
    await download(decode(form[1]) + "?" + params.toString(), dest, { rejectHtml: true, retries: 2 });
  }
}

/** Devuelve la ruta local del clip (lo descarga de Drive la primera vez). */
export async function ensureLocal(clip) {
  if (clip.kind === "local") return clip.path;
  const ext = (VIDEO_EXT.exec(clip.name) || [".mp4"])[0].toLowerCase();
  const dest = path.join(CACHE_DIR, "drive", clip.id + ext);
  if (!(await exists(dest))) await driveDownload(clip.id, dest);
  return dest;
}

async function thumbFor(clip) {
  const dest = path.join(CACHE_DIR, "thumbs", (clip.kind === "drive" ? clip.id : Buffer.from(clip.path).toString("base64url").slice(-40)) + ".jpg");
  if (await exists(dest)) return dest;
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  if (clip.kind === "drive") {
    try {
      await download(`https://drive.google.com/thumbnail?id=${clip.id}&sz=w480`, dest, { rejectHtml: true, retries: 1 });
      return dest;
    } catch {
      return null;
    }
  }
  const info = await probe(clip.path);
  clip.duration = info.duration;
  clip.orientation = info.orientation;
  await frameAt(clip.path, info.duration * 0.4, dest, 360, 640);
  return dest;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null); }
  }));
  return out;
}

/** Hoja de contacto con miniaturas numeradas (JPG) de una página de clips. */
export async function contactSheet(clips, { page = 1, perPage = 24 } = {}) {
  const { ffmpeg } = await requireDeps("ffmpeg");
  const slice = clips.slice((page - 1) * perPage, page * perPage);
  const thumbs = await pool(slice, 6, thumbFor);
  const cols = Math.min(6, slice.length), tw = 220, th = 391;
  const rows = Math.ceil(slice.length / cols);
  const W = cols * (tw + 12) + 12, H = rows * (th + 52) + 12;
  const cells = slice.map((c, i) => `<div class="c"><div class="t">${thumbs[i] ? `<img src="${fileUrl(thumbs[i])}">` : `<span>sin miniatura</span>`}<b>${c.n}</b>${c.duration ? `<i>${Math.round(c.duration)}s</i>` : ""}</div><p>${escapeHtml(c.name.length > 30 ? "…" + c.name.slice(-29) : c.name)}</p></div>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#111;font:600 15px system-ui;color:#ddd}
.g{display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:12px;padding:12px}
.t{position:relative;width:${tw}px;height:${th}px;background:#222;border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.t img{width:100%;height:100%;object-fit:cover}
b{position:absolute;left:8px;top:8px;background:#ff3d7f;color:#fff;font:800 30px system-ui;padding:2px 12px;border-radius:8px}
i{position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,.7);font-style:normal;padding:2px 8px;border-radius:6px}
p{margin:6px 2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;height:22px}</style><div class="g">${cells}</div>`;
  const png = tmpFile("png");
  await screenshot(html, png, W, H, { transparent: false });
  const jpg = tmpFile("jpg");
  await runOk(ffmpeg, ["-v", "error", "-y", "-i", png, "-q:v", "4", jpg]);
  fsp.unlink(png).catch(() => {});
  return { file: jpg, shown: slice.map((c) => c.n), pages: Math.ceil(clips.length / perPage) };
}

/** Tira de fotogramas de un clip con las zonas de UI marcadas (para decidir dónde va el texto). */
export async function clipStrip(file, info, { format = "9:16", zone, start = 0, length, frames = 5 } = {}) {
  const { ffmpeg } = await requireDeps("ffmpeg");
  const span = length || Math.max(0.5, info.duration - start);
  const tw = 270, th = format === "9:16" ? 480 : format === "4:5" ? 338 : 270;
  const shots = [];
  for (let k = 0; k < frames; k++) {
    const t = start + span * ((k + 0.5) / frames);
    const f = tmpFile("jpg");
    await frameAt(file, t, f, tw, th);
    shots.push({ t, f });
  }
  const lines = Array.from({ length: 9 }, (_, i) => `<div class="l" style="top:${(i + 1) * 10}%"><em>${(i + 1) * 10}%</em></div>`).join("");
  const z = zone || { top: 0, bottom: 0 };
  const cells = shots.map((s) => `<div class="c"><img src="${fileUrl(s.f)}"><div class="z" style="top:0;height:${z.top * 100}%"></div><div class="z" style="bottom:0;height:${z.bottom * 100}%"></div>${lines}<p>${s.t.toFixed(1)}s</p></div>`).join("");
  const W = frames * (tw + 10) + 10, H = th + 20;
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#111;font:600 13px system-ui;color:#fff}
.g{display:flex;gap:10px;padding:10px}.c{position:relative;width:${tw}px;height:${th}px;overflow:hidden;border-radius:8px}
img{width:100%;height:100%;object-fit:cover}.z{position:absolute;left:0;right:0;background:rgba(255,40,40,.32)}
.l{position:absolute;left:0;right:0;border-top:1px dashed rgba(255,255,255,.55)}em{position:absolute;left:3px;top:-1px;font-style:normal;font-size:11px;text-shadow:0 0 3px #000}
p{position:absolute;right:6px;top:4px;margin:0;background:rgba(0,0,0,.6);padding:1px 6px;border-radius:5px}</style><div class="g">${cells}</div>`;
  const png = tmpFile("png");
  await screenshot(html, png, W, H, { transparent: false });
  const jpg = tmpFile("jpg");
  await runOk(ffmpeg, ["-v", "error", "-y", "-i", png, "-q:v", "4", jpg]);
  for (const s of shots) fsp.unlink(s.f).catch(() => {});
  fsp.unlink(png).catch(() => {});
  return jpg;
}
