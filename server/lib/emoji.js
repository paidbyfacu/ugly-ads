// Emojis: se reemplazan por imágenes (estilo Apple como en Instagram, con Twemoji de respaldo).
import path from "node:path";
import { CACHE_DIR, download, exists, fileUrl } from "./util.js";

const APPLE = (c) => `https://cdn.jsdelivr.net/npm/emoji-datasource-apple@16.0.0/img/apple/64/${c}.png`;
const TWEMOJI = (c) => `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${c}.svg`;

// Secuencia emoji: pictográfico (o bandera / keycap) + modificadores, ZWJ, variaciones.
export const EMOJI_RE =
  /(?:[#*0-9]️?⃣)|(?:\p{Regional_Indicator}{2})|(?:(?![©®™])\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*)/gu;

function codeOf(seq, keepFE0F = true) {
  return [...seq]
    .map((ch) => ch.codePointAt(0))
    .filter((cp) => keepFE0F || cp !== 0xfe0f)
    .map((cp) => cp.toString(16))
    .join("-");
}

const resolved = new Map();

async function resolveOne(seq, style) {
  const key = style + ":" + seq;
  if (resolved.has(key)) return resolved.get(key);
  const dir = path.join(CACHE_DIR, "emoji", style);
  const full = codeOf(seq, true);
  const bare = codeOf(seq, false);
  const tries =
    style === "twemoji"
      ? [[TWEMOJI(bare), bare + ".svg"]]
      : [[APPLE(full), full + ".png"], [APPLE(bare), bare + ".png"], [TWEMOJI(bare), "tw-" + bare + ".svg"]];
  let out = null;
  for (const [url, name] of tries) {
    const dest = path.join(dir, name);
    if (await exists(dest)) { out = dest; break; }
    try { await download(url, dest); out = dest; break; } catch {}
  }
  const v = out ? fileUrl(out) : null;
  resolved.set(key, v);
  return v;
}

/** Devuelve Map<secuencia, file-url> para todos los emojis del texto. */
export async function resolveEmojis(text, style = "apple") {
  const seqs = [...new Set(String(text).match(EMOJI_RE) || [])];
  const map = new Map();
  await Promise.all(seqs.map(async (s) => map.set(s, await resolveOne(s, style))));
  return map;
}
