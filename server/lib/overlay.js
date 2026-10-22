// Spec del ugly ad -> HTML de la capa de texto (burbujas estilo Instagram) -> PNG transparente.
import { escapeHtml, clamp } from "./util.js";
import { FONT_STACKS, fontCss } from "./fonts.js";
import { EMOJI_RE, resolveEmojis } from "./emoji.js";
import { screenshot, dumpDom } from "./chrome.js";

export const FORMATS = {
  "9:16": [1080, 1920],
  "4:5": [1080, 1350],
  "1:1": [1080, 1080],
};

// Zonas que tapa la interfaz (fracciones del alto/ancho). "reels" es el default: deja libre la
// barra de arriba y el caption/CTA de abajo sin ser tan restrictivo como la guía oficial de Meta.
export const SAFE_ZONES = {
  reels: { top: 0.12, bottom: 0.24, side: 0.06 },
  strict: { top: 0.14, bottom: 0.35, side: 0.06 },
  stories: { top: 0.14, bottom: 0.2, side: 0.06 },
  feed: { top: 0.05, bottom: 0.05, side: 0.05 },
  none: { top: 0.02, bottom: 0.02, side: 0.03 },
};

// Paleta de colores de texto de Instagram/Edits (los nombres se pueden usar en el spec).
export const PALETTE = {
  white: "#FFFFFF",
  black: "#000000",
  magenta: "#D10869",
  pink: "#E1306C",
  red: "#ED4956",
  orange: "#FD8D32",
  yellow: "#FDCB5C",
  green: "#70C050",
  blue: "#3897F0",
  purple: "#A307BA",
  gray: "#262626",
};

const SIZES = { xs: 0.7, s: 0.82, m: 1, l: 1.18, xl: 1.42, xxl: 1.75 };
const STYLES = ["title", "bubble", "plain"];

function color(c, fallback) {
  if (!c) return fallback;
  const k = String(c).toLowerCase().trim();
  return PALETTE[k] || c;
}

function luminance(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return 0.5;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function autoText(bg) {
  return luminance(bg) > 0.42 ? "#000000" : "#FFFFFF";
}

/** Valida y completa el spec con defaults. Devuelve { spec, warnings }. */
export function normalizeSpec(input) {
  const warnings = [];
  const s = JSON.parse(JSON.stringify(input || {}));
  s.format = FORMATS[s.format] ? s.format : "9:16";
  s.safe_zone = SAFE_ZONES[s.safe_zone] ? s.safe_zone : s.format === "9:16" ? "reels" : "feed";
  s.font = FONT_STACKS[s.font] ? s.font : "instagram";
  s.emoji_style = s.emoji_style === "twemoji" ? "twemoji" : "apple";
  s.align = ["left", "center", "right"].includes(s.align) ? s.align : "center";
  s.text_scale = clamp(Number(s.text_scale) || 1, 0.5, 2);
  s.dim = s.dim === undefined ? 0.12 : clamp(Number(s.dim) || 0, 0, 0.85);
  // Sombra suave detrás del bloque de texto (franja negra con bordes difuminados), así el texto no "flota" sobre el video.
  s.shade = s.shade === undefined ? 0.32 : clamp(Number(s.shade) || 0, 0, 0.8);
  if (s.position === undefined) s.position = "center";
  if (typeof s.position === "number") s.position = clamp(s.position, 0, 1);
  else if (!["top", "center", "bottom"].includes(s.position)) {
    const n = Number(s.position);
    s.position = Number.isFinite(n) ? clamp(n > 1 ? n / 100 : n, 0, 1) : "center";
  }
  s.gap = clamp(Number(s.gap ?? 0.55), 0, 2);
  if (!Array.isArray(s.blocks) || !s.blocks.length) throw new Error("El spec necesita `blocks` con al menos un bloque de texto.");
  s.blocks = s.blocks.map((b, i) => {
    if (typeof b === "string") b = { style: "bubble", text: b };
    const style = STYLES.includes(b.style) ? b.style : "bubble";
    if (!STYLES.includes(b.style) && b.style) warnings.push(`Bloque ${i + 1}: estilo "${b.style}" no existe, uso "bubble".`);
    const out = { ...b, style, text: String(b.text ?? "") };
    out.size = typeof b.size === "number" ? clamp(b.size, 0.4, 3) : SIZES[b.size] || (style === "title" ? 1.15 : 1);
    if (style === "bubble") {
      out.bg = color(b.bg, "#FFFFFF");
      out.color = color(b.color, autoText(out.bg));
      out.opacity = clamp(Number(b.opacity ?? 1), 0.2, 1);
    } else if (style === "title") {
      const g = Array.isArray(b.gradient) && b.gradient.length ? b.gradient.map((c) => color(c)) : null;
      out.gradient = g || (b.bg ? [color(b.bg), color(b.bg)] : ["#E6006F", "rgba(70,70,70,0.78)"]);
      out.color = color(b.color, "#FFFFFF");
    } else {
      out.color = color(b.color, "#FFFFFF");
    }
    const words = out.text.replace(EMOJI_RE, "").split(/\s+/).filter(Boolean).length;
    if (words > 22) warnings.push(`Bloque ${i + 1} tiene ${words} palabras: en un ugly ad conviene <= 14 por bloque.`);
    return out;
  });
  if (s.blocks.length > 7) warnings.push(`Hay ${s.blocks.length} bloques: más de 6-7 se vuelve difícil de leer.`);
  return { spec: s, warnings };
}

function rich(text, emojis) {
  let h = escapeHtml(text);
  h = h.replace(/\*\*(.+?)\*\*/gs, "<b>$1</b>");
  h = h.replace(EMOJI_RE, (m) => {
    const src = emojis.get(m);
    return src ? `<img class="emj" src="${src}" alt="">` : m;
  });
  return h.replace(/\r?\n/g, "<br>");
}

function blockHtml(b, emojis) {
  const fs = `font-size:calc(var(--base) * ${b.size})`;
  const body = rich(b.text, emojis);
  if (b.style === "bubble") {
    const bg = b.opacity < 1 ? hexAlpha(b.bg, b.opacity) : b.bg;
    return `<div class="blk bubble" style="${fs}"><span style="background:${bg};color:${b.color}">${body}</span></div>`;
  }
  if (b.style === "title") {
    const g = b.gradient.length === 1 ? [b.gradient[0], b.gradient[0]] : b.gradient;
    const stops = g.length === 2 ? `${g[0]} 0%, ${g[0]} 22%, ${g[1]} 100%` : g.join(", ");
    return `<div class="blk title" style="${fs}"><div class="pill" style="background:linear-gradient(95deg, ${stops});color:${b.color}">${body}</div></div>`;
  }
  return `<div class="blk plain" style="${fs};color:${b.color}"><span>${body}</span></div>`;
}

function hexAlpha(c, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  if (!m) return c;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Construye el HTML de la capa. opts.guides dibuja las zonas seguras (solo para previews). */
export async function buildOverlayHtml(spec, { guides = false } = {}) {
  const [W, H] = FORMATS[spec.format];
  const z = SAFE_ZONES[spec.safe_zone];
  const emojis = await resolveEmojis(spec.blocks.map((b) => b.text).join("\n"), spec.emoji_style);
  const css = await fontCss();
  const side = Math.round(z.side * W);
  const cfg = { W, H, top: Math.round(z.top * H), bottom: Math.round(z.bottom * H), pos: spec.position, shade: spec.shade, base: +(W * 0.048 * spec.text_scale).toFixed(2) };
  const align = spec.align;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${css}
html,body{margin:0;padding:0;width:${W}px;height:${H}px;overflow:hidden;background:transparent}
body{font-family:${FONT_STACKS[spec.font]};-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
#stage{position:absolute;left:${side}px;width:${W - 2 * side}px;top:0;transform-origin:50% 0;--base:${cfg.base}px;text-align:${align}}
.blk{margin:0;text-align:${align}}
.blk + .blk{margin-top:calc(var(--base) * ${spec.gap})}
.bubble{line-height:1.36;font-weight:700;letter-spacing:-0.005em}
.bubble > span{-webkit-box-decoration-break:clone;box-decoration-break:clone;padding:.14em .5em .16em;border-radius:.3em}
.bubble b{font-weight:900}
.title .pill{display:inline-block;max-width:100%;box-sizing:border-box;padding:.36em .95em .42em;border-radius:.44em;line-height:1.13;font-weight:400}
.title b{font-weight:700}
.plain{font-weight:700;line-height:1.2;text-shadow:0 2px 12px rgba(0,0,0,.45),0 0 2px rgba(0,0,0,.3)}
.plain b{font-weight:900}
.emj{height:1.1em;width:auto;vertical-align:-0.22em;margin:0 .05em}
.guide{position:absolute;background:rgba(255,40,40,.22);border:3px dashed rgba(255,80,80,.9);box-sizing:border-box;color:#fff;font:600 26px system-ui;display:flex;align-items:center;justify-content:center}
#metrics{display:none}
#shade{position:absolute;left:0;right:0;top:0;height:0;pointer-events:none}
</style></head><body>
${guides ? `<div class="guide" style="left:0;top:0;width:${W}px;height:${cfg.top}px">zona UI arriba</div>
<div class="guide" style="left:0;bottom:0;width:${W}px;height:${cfg.bottom}px">zona UI abajo (caption / CTA)</div>` : ""}
<div id="shade"></div>
<div id="stage">
${spec.blocks.map((b) => blockHtml(b, emojis)).join("\n")}
</div>
<pre id="metrics"></pre>
<script>
(async () => {
  try { await document.fonts.ready; } catch (e) {}
  const C = ${JSON.stringify(cfg)};
  const st = document.getElementById('stage');
  // Cada palabra en su span para detectar líneas y palabras huérfanas.
  const tw = document.createTreeWalker(st, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (tw.nextNode()) nodes.push(tw.currentNode);
  for (const n of nodes) {
    const frag = document.createDocumentFragment();
    for (const p of n.textContent.split(/(\\s+)/)) {
      if (!p) continue;
      if (/^\\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); continue; }
      const w = document.createElement('span'); w.className = 'w'; w.textContent = p; frag.appendChild(w);
    }
    n.replaceWith(frag);
  }
  // Si no entra en la zona segura, se achica la letra (y se recalculan los cortes), no la imagen.
  const avail = C.H - C.top - C.bottom;
  let k = 1;
  for (let i = 0; i < 45 && st.offsetHeight > avail; i++) { k *= 0.96; st.style.setProperty('--base', (C.base * k) + 'px'); }
  const hh = Math.min(st.offsetHeight, avail);
  const cy = C.pos === 'top' ? C.top + hh / 2 : C.pos === 'bottom' ? C.H - C.bottom - hh / 2 : C.pos === 'center' ? C.top + avail / 2 : C.pos * C.H;
  const y = Math.min(Math.max(cy - hh / 2, C.top), C.H - C.bottom - hh);
  st.style.transform = 'translateY(' + y + 'px)';
  if (C.shade > 0) {
    const pad = Math.max(170, hh * 0.3), tot = hh + 2 * pad, e = (100 * pad / tot).toFixed(1), a = 'rgba(0,0,0,' + C.shade + ')';
    const sh = document.getElementById('shade');
    sh.style.top = (y - pad) + 'px';
    sh.style.height = tot + 'px';
    sh.style.background = 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, ' + a + ' ' + e + '%, ' + a + ' ' + (100 - e) + '%, rgba(0,0,0,0) 100%)';
  }
  const blocks = [...st.children].map((el, i) => {
    const inner = el.firstElementChild || el;
    const r = inner.getBoundingClientRect();
    const tops = [...inner.querySelectorAll('.w')].filter((w) => /[A-Za-z0-9À-ɏ$%]/.test(w.textContent)).map((w) => w.getBoundingClientRect().top).sort((a, b) => a - b);
    const lines = [];
    for (const t of tops) { if (!lines.length || t - lines[lines.length - 1].t > 8) lines.push({ t, n: 1 }); else lines[lines.length - 1].n++; }
    return { i: i + 1, lines: Math.max(1, lines.length), orphan: lines.length > 1 && lines[lines.length - 1].n === 1, top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) };
  });
  document.getElementById('metrics').textContent = JSON.stringify({ top: Math.round(y), bottom: Math.round(y + hh), height: Math.round(hh), scale: +k.toFixed(3), fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight).slice(0, 30), blocks });
})();
</script></body></html>`;
}

/** Renderiza la capa a PNG y devuelve métricas de layout (posición final, escala, líneas por bloque). */
export async function renderOverlay(spec, out, { guides = false } = {}) {
  const [W, H] = FORMATS[spec.format];
  const html = await buildOverlayHtml(spec, { guides });
  await screenshot(html, out, W, H);
  let metrics = null;
  try {
    const dom = await dumpDom(html, W, H);
    const m = /<pre id="metrics">([\s\S]*?)<\/pre>/.exec(dom);
    if (m) metrics = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  } catch {}
  return { path: out, width: W, height: H, metrics };
}
