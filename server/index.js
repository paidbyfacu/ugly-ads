#!/usr/bin/env node
// Servidor MCP (stdio, JSON-RPC 2.0) de Ugly Ads. Sin dependencias: solo Node >= 18, ffmpeg y Chrome/Edge.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { TOOLS, callTool } from "./lib/tools.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(here, "../package.json"), "utf8"));
const COMMANDS_DIR = path.join(here, "../commands");

// Los comandos del plugin (commands/*.md) también se exponen como prompts MCP,
// así funcionan en Claude Desktop y en cualquier cliente MCP.
function loadPrompts() {
  const out = [];
  for (const f of fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith(".md")).sort()) {
    const raw = fs.readFileSync(path.join(COMMANDS_DIR, f), "utf8");
    const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
    const meta = {};
    if (fm) for (const line of fm[1].split(/\r?\n/)) { const m = /^([\w-]+):\s*(.*)$/.exec(line); if (m) meta[m[1]] = m[2].replace(/^"|"$/g, ""); }
    out.push({ name: f.replace(/\.md$/, ""), description: meta.description || "", hint: meta["argument-hint"] || "", body: fm ? raw.slice(fm[0].length) : raw });
  }
  return out;
}
const PROMPTS = loadPrompts();

const INSTRUCTIONS =
  "Ugly Ads genera videos verticales con texto fijo estilo Instagram sobre un clip de fondo y música. " +
  "Flujo: contexto → copy aprobado por el usuario → ugly_footage → ugly_inspect → ugly_preview → ugly_render. " +
  "Leé ugly_guide antes del primer ugly ad de la sesión.";

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function handle(req) {
  const { method, params = {} } = req;
  switch (method) {
    case "initialize":
      return {
        protocolVersion: params.protocolVersion || "2025-06-18",
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: { name: "ugly-ads", version: pkg.version },
        instructions: INSTRUCTIONS,
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS };
    case "tools/call":
      try {
        const content = await callTool(params.name, params.arguments);
        return { content };
      } catch (e) {
        process.stderr.write(`[ugly-ads] ${params.name}: ${e.stack || e}\n`);
        return { content: [{ type: "text", text: `Error: ${e.message || e}` }], isError: true };
      }
    case "prompts/list":
      return {
        prompts: PROMPTS.map((p) => ({
          name: p.name,
          description: p.description,
          arguments: [{ name: "pedido", description: p.hint || "Detalle del pedido", required: false }],
        })),
      };
    case "prompts/get": {
      const p = PROMPTS.find((x) => x.name === params.name);
      if (!p) throw Object.assign(new Error(`Prompt desconocido: ${params.name}`), { code: -32602 });
      const arg = params.arguments?.pedido || "";
      return { description: p.description, messages: [{ role: "user", content: { type: "text", text: p.body.replace(/\$ARGUMENTS/g, arg) } }] };
    }
    case "resources/list":
      return { resources: [] };
    default:
      throw Object.assign(new Error(`Método no soportado: ${method}`), { code: -32601 });
  }
}

const rl = readline.createInterface({ input: process.stdin });
const pending = new Set();
rl.on("line", (line) => {
  const p = onLine(line);
  pending.add(p);
  p.finally(() => pending.delete(p));
});
async function onLine(line) {
  if (!line.trim()) return;
  let req;
  try { req = JSON.parse(line); } catch { return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
  if (req.id === undefined || req.id === null) return; // notificación
  try {
    send({ jsonrpc: "2.0", id: req.id, result: await handle(req) });
  } catch (e) {
    send({ jsonrpc: "2.0", id: req.id, error: { code: e.code || -32603, message: e.message || String(e) } });
  }
}
// Al cerrarse stdin, terminar las respuestas en curso antes de salir.
rl.on("close", async () => { await Promise.allSettled([...pending]); process.exit(0); });
process.on("uncaughtException", (e) => process.stderr.write(`[ugly-ads] ${e.stack || e}\n`));
