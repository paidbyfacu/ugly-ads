// Localiza ffmpeg, ffprobe y un navegador Chromium (Chrome, Edge, Brave o Chromium).
import path from "node:path";
import os from "node:os";
import { run, exists } from "./util.js";

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

async function which(name) {
  try {
    const r = await run(isWin ? "where" : "which", [name], { timeout: 5000 });
    if (r.code === 0) return r.stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean) || null;
  } catch {}
  return null;
}

async function firstExisting(list) {
  for (const p of list) if (p && (await exists(p))) return p;
  return null;
}

let cache = null;

export async function findDeps() {
  if (cache) return cache;
  const ffmpeg = process.env.FFMPEG_PATH || (await which("ffmpeg")) ||
    (await firstExisting(["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]));
  const ffprobe = process.env.FFPROBE_PATH ||
    (ffmpeg ? await firstExisting([path.join(path.dirname(ffmpeg), isWin ? "ffprobe.exe" : "ffprobe")]) : null) ||
    (await which("ffprobe"));

  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const pf = process.env.ProgramFiles || "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const candidates = isWin
    ? [
        path.join(pf, "Google/Chrome/Application/chrome.exe"),
        path.join(pf86, "Google/Chrome/Application/chrome.exe"),
        path.join(local, "Google/Chrome/Application/chrome.exe"),
        path.join(pf86, "Microsoft/Edge/Application/msedge.exe"),
        path.join(pf, "Microsoft/Edge/Application/msedge.exe"),
        path.join(pf, "BraveSoftware/Brave-Browser/Application/brave.exe"),
      ]
    : isMac
    ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
      ]
    : [];
  let chrome = process.env.CHROME_PATH || (await firstExisting(candidates));
  if (!chrome && !isWin && !isMac) {
    for (const n of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]) {
      chrome = await which(n);
      if (chrome) break;
    }
  }
  cache = { ffmpeg, ffprobe, chrome };
  return cache;
}

export function installHints() {
  if (isWin) return { ffmpeg: "winget install Gyan.FFmpeg   (después cerrá y abrí Claude)", chrome: "Instalá Google Chrome o Microsoft Edge" };
  if (isMac) return { ffmpeg: "brew install ffmpeg", chrome: "Instalá Google Chrome" };
  return { ffmpeg: "sudo apt install ffmpeg", chrome: "sudo apt install chromium" };
}

export async function requireDeps(...names) {
  const d = await findDeps();
  const missing = names.filter((n) => !d[n]);
  if (missing.length) {
    const h = installHints();
    throw new Error(
      `Falta: ${missing.join(", ")}.\n` +
        missing.map((m) => `- ${m}: ${h[m === "ffprobe" ? "ffmpeg" : m]}`).join("\n") +
        `\nTambién podés indicar la ruta con las variables FFMPEG_PATH / CHROME_PATH.`
    );
  }
  return d;
}
