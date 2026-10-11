// Biblioteca de música: catálogo libre incluido (FreePD, dominio público) + temas propios en ~/UglyAds/musica.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WORK_DIR, CACHE_DIR, download, exists, slug, normPath } from "./util.js";
import { loudStart } from "./video.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(fs.readFileSync(path.join(here, "../../music/catalog.json"), "utf8"));
const TRACKS_DIR = path.join(here, "../../music/tracks");
export const OWN_MUSIC_DIR = path.join(WORK_DIR, "musica");
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|flac)$/i;

async function ownTracks() {
  try {
    const files = await fsp.readdir(OWN_MUSIC_DIR);
    return files.filter((f) => AUDIO_EXT.test(f)).map((f) => ({
      id: "propia-" + slug(f.replace(AUDIO_EXT, "")),
      title: f.replace(AUDIO_EXT, ""),
      moods: ["propia"],
      file: path.join(OWN_MUSIC_DIR, f),
    }));
  } catch {
    return [];
  }
}

export async function listTracks(mood) {
  const all = [...(await ownTracks()), ...catalog.tracks];
  const m = mood && String(mood).toLowerCase();
  return m ? all.filter((t) => t.moods.some((x) => x.includes(m) || m.includes(x))) : all;
}

export const MUSIC_INFO = { source: catalog.source, license: catalog.license, own_dir: OWN_MUSIC_DIR };

/** Elige un tema: id/título exacto, ruta a un archivo, "random" (opcionalmente filtrado por mood). */
export async function pickTrack({ track, mood, exclude } = {}) {
  if (track && track !== "random" && track !== "aleatoria") {
    if (AUDIO_EXT.test(track) && (await exists(normPath(track)))) return { id: "archivo", title: path.basename(track), moods: [], file: normPath(track) };
    const all = await listTracks();
    const q = slug(track);
    const t = all.find((x) => x.id === q || slug(x.title) === q) || all.find((x) => x.id.includes(q) || slug(x.title).includes(q));
    if (!t) throw new Error(`No encontré el tema "${track}". Usá ugly_music para ver la lista.`);
    return t;
  }
  let pool = await listTracks(mood);
  if (!pool.length) pool = await listTracks();
  const filtered = pool.filter((t) => t.id !== exclude);
  const list = filtered.length ? filtered : pool;
  return list[Math.floor(Math.random() * list.length)];
}

/** Devuelve el tema con su archivo local (los del catálogo vienen incluidos en music/tracks). */
export async function ensureTrack(t) {
  let file = t.file;
  if (!file) {
    file = path.join(TRACKS_DIR, t.id + ".mp3");
    if (!(await exists(file))) {
      // Respaldo: si falta el archivo incluido, se baja el original una vez.
      file = path.join(CACHE_DIR, "music", t.id + ".mp3");
      if (!(await exists(file))) await download(catalog.base_url + t.path.split("/").map(encodeURIComponent).join("/"), file, { retries: 6 });
    }
  }
  let start = 0;
  if (t.file || file.startsWith(CACHE_DIR)) { try { start = await loudStart(file); } catch {} }
  return { ...t, file, auto_start: start };
}
