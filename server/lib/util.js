// Utilidades compartidas: rutas de trabajo, ejecución de procesos, descargas con caché.
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";

export const WORK_DIR = process.env.UGLY_ADS_DIR || path.join(os.homedir(), "UglyAds");
export const CACHE_DIR = path.join(WORK_DIR, ".cache");
export const TMP_DIR = path.join(CACHE_DIR, "tmp");

export async function ensureDirs() {
  for (const d of [WORK_DIR, CACHE_DIR, TMP_DIR]) await fsp.mkdir(d, { recursive: true });
}

export function sha(s, n = 12) {
  return crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, n);
}

export function tmpFile(ext) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  return path.join(TMP_DIR, `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}.${ext}`);
}

/** Normaliza rutas que llegan del usuario/Claude: comillas, ~ y estilo Git Bash (/c/Users/...) en Windows. */
export function normPath(p) {
  let s = String(p).trim().replace(/^["']|["']$/g, "");
  if (s.startsWith("~")) s = path.join(os.homedir(), s.slice(1));
  if (process.platform === "win32") s = s.replace(/^\/([a-zA-Z])\//, (_, d) => d.toUpperCase() + ":/");
  return path.resolve(s);
}

export function fileUrl(p) {
  return pathToFileURL(path.resolve(p)).href;
}

/** Ejecuta un binario y devuelve { code, stdout, stderr } (stdout como Buffer si binary=true). */
export function run(cmd, args, { binary = false, timeout = 10 * 60 * 1000, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, cwd });
    const out = [];
    let err = "";
    const t = setTimeout(() => p.kill("SIGKILL"), timeout);
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => { err += d.toString(); if (err.length > 200000) err = err.slice(-100000); });
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code) => {
      clearTimeout(t);
      const buf = Buffer.concat(out);
      resolve({ code, stdout: binary ? buf : buf.toString(), stderr: err });
    });
  });
}

export async function runOk(cmd, args, opts) {
  const r = await run(cmd, args, opts);
  if (r.code !== 0) throw new Error(`${path.basename(cmd)} falló (código ${r.code}):\n${r.stderr.slice(-1500)}`);
  return r;
}

export async function exists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export async function fetchText(url, headers = {}) {
  const r = await fetch(url, { headers: { "user-agent": UA, ...headers }, redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
  return r.text();
}

/** Descarga a un archivo (escritura atómica). Devuelve la respuesta para inspeccionar headers. */
export async function download(url, dest, { headers = {}, rejectHtml = false, retries = 0 } = {}) {
  let r;
  for (let i = 0; ; i++) {
    r = await fetch(url, { headers: { "user-agent": UA, ...headers }, redirect: "follow" }).catch((e) => ({ ok: false, status: e.message }));
    if (r.ok || i >= retries || (r.status >= 400 && r.status < 500)) break;
    await new Promise((res) => setTimeout(res, 600 * (i + 1)));
  }
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
  const ct = r.headers.get("content-type") || "";
  if (rejectHtml && ct.includes("text/html")) {
    const html = await r.text();
    const e = new Error("La respuesta fue HTML, no un archivo");
    e.html = html;
    throw e;
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const part = dest + ".part";
  await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(part));
  await fsp.rename(part, dest);
  return r;
}

/** Descarga con caché por URL. */
export async function cached(url, subdir, ext, opts) {
  const dest = path.join(CACHE_DIR, subdir, `${sha(url, 16)}.${ext}`);
  if (await exists(dest)) return dest;
  await download(url, dest, opts);
  return dest;
}

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function slug(s, max = 40) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, max) || "ugly-ad";
}

export function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
