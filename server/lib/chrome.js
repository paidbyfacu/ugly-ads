// Chrome/Edge headless como motor de layout: HTML -> PNG (con transparencia) y HTML -> DOM final.
import fsp from "node:fs/promises";
import path from "node:path";
import { requireDeps } from "./deps.js";
import { run, CACHE_DIR, tmpFile, fileUrl, exists } from "./util.js";

let queue = Promise.resolve();
function serial(fn) {
  const p = queue.then(fn, fn);
  queue = p.catch(() => {});
  return p;
}

function baseArgs(w, h) {
  return [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--mute-audio",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--allow-file-access-from-files",
    "--force-device-scale-factor=1",
    `--user-data-dir=${path.join(CACHE_DIR, "chrome-profile")}`,
    `--window-size=${w},${h}`,
    "--virtual-time-budget=15000",
    "--run-all-compositor-stages-before-draw",
  ];
}

async function writeHtml(html) {
  const p = tmpFile("html");
  await fsp.writeFile(p, html, "utf8");
  return p;
}

/** Renderiza HTML a PNG. transparent=true deja el fondo con alfa. */
export function screenshot(html, out, w, h, { transparent = true } = {}) {
  return serial(async () => {
    const { chrome } = await requireDeps("chrome");
    const file = await writeHtml(html);
    out = path.resolve(out);
    const args = [...baseArgs(w, h), `--screenshot=${out}`];
    if (transparent) args.push("--default-background-color=00000000");
    args.push(fileUrl(file));
    const r = await run(chrome, args, { timeout: 90000 });
    if (!(await exists(out))) throw new Error(`Chrome no generó la captura.\n${r.stderr.slice(-1200)}`);
    fsp.unlink(file).catch(() => {});
    return out;
  });
}

/** Devuelve el DOM serializado después de ejecutar los scripts de la página. */
export function dumpDom(html, w, h) {
  return serial(async () => {
    const { chrome } = await requireDeps("chrome");
    const file = await writeHtml(html);
    const r = await run(chrome, [...baseArgs(w, h), "--dump-dom", fileUrl(file)], { timeout: 90000 });
    fsp.unlink(file).catch(() => {});
    return r.stdout;
  });
}
