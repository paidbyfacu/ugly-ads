// Fuentes: se bajan una vez de Google Fonts (SIL OFL) y quedan en caché local.
// "instagram" usa Instagram Sans si está instalada en la compu; si no, Figtree (la más parecida libre).
import fsp from "node:fs/promises";
import path from "node:path";
import { CACHE_DIR, fetchText, download, exists, fileUrl, sha } from "./util.js";

const CSS_URL =
  "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&family=Figtree:wght@300;400;500;600;700;800;900&display=block";

export const FONT_STACKS = {
  instagram: `"Instagram Sans", "Instagram Sans Headline", "Figtree", "Poppins", system-ui, sans-serif`,
  poppins: `"Poppins", "Figtree", system-ui, sans-serif`,
};

let cssCache = null;

export async function fontCss() {
  if (cssCache) return cssCache;
  const dir = path.join(CACHE_DIR, "fonts");
  const cssPath = path.join(dir, "fonts.css");
  if (await exists(cssPath)) return (cssCache = await fsp.readFile(cssPath, "utf8"));
  try {
    let css = await fetchText(CSS_URL);
    const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
    // Solo subsets latin / latin-ext: alcanza para español y ahorra descargas.
    const blocks = css.split("}").filter((b) => /\/\* (latin|latin-ext) \*\//.test(b));
    css = blocks.map((b) => b + "}").join("\n");
    for (const u of urls) {
      if (!css.includes(u)) continue;
      const dest = path.join(dir, sha(u, 16) + ".woff2");
      if (!(await exists(dest))) await download(u, dest);
      css = css.split(u).join(fileUrl(dest));
    }
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(cssPath, css, "utf8");
    return (cssCache = css);
  } catch (e) {
    // Sin internet: se usan las fuentes del sistema.
    return "";
  }
}
