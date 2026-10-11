// Estado persistente entre sesiones: última fuente de clips, último spec y último video.
import fs from "node:fs";
import path from "node:path";
import { WORK_DIR } from "./util.js";

const FILE = path.join(WORK_DIR, "state.json");
let state = null;

export function getState() {
  if (state) return state;
  try { state = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { state = {}; }
  state.clips ||= [];
  state.history ||= [];
  return state;
}

export function saveState(patch = {}) {
  Object.assign(getState(), patch);
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 1), "utf8");
  return state;
}
