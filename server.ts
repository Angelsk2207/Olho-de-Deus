import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = Number(process.env.PORT) || 3000;
app.use(express.json({ limit: "1mb" }));

interface Lead { id: string; name: string; address: string; phone: string; website: string; category: string; source: string; confidence: number; status: string; }
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function normalize(item: any, index: number): Lead {
  const p = item.properties || {};
  const name = String(p.name || p.operator || "Local sem nome").trim();
  const address = [p.street, p.housenumber, p.city, p.state, p.country].filter(Boolean).join(", ") || "Endereço não informado";
  const phone = String(p.phone || p.contact?.phone || "").trim();
  const website = String(p.website || p.contact?.website || "").trim();
  const category = String(p.osm_value || p.type || "empresa").trim();
  const fields = [name !== "Local sem nome", address !== "Endereço não informado", Boolean(phone), Boolean(website)].filter(Boolean).length;
  return { id: `osm:${p.osm_type || "feature"}:${p.osm_id || index}`, name, address, phone, website, category, source: "OpenStreetMap / Photon", confidence: Math.round(45 + fields * 13.75), status: "Novo" };
}
function dedupe(leads: Lead[]) { const seen = new Set<string>(); return leads.filter(l => { const key = `${l.name.toLowerCase()}|${l.address.toLowerCase()}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
async function collect(query: string): Promise<Lead[]> {
  const normalizedQuery = query
    .replace(/\bpadarias\b/gi, "padaria")
    .replace(/\bclínicas\b/gi, "clínica")
    .replace(/\bacademias\b/gi, "academia")
    .replace(/\s+\b(em|no|na|do|da)\b\s+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const response = await axios.get("https://photon.komoot.io/api/", { params: { q: normalizedQuery.slice(0, 180), limit: 20, lang: "pt" }, headers: { "User-Agent": "OlhoDeDeus/2.0 (public-osint; contact: lead-search)" }, timeout: 12000 });
  return dedupe((response.data?.features || []).map(normalize));
}
async function pipeline(query: string, emit: (stage: string, message: string, count?: number) => void) {
  emit("coordenador", "Coordenador preparando a captura"); await wait(180);
  emit("coleta", "Buscando em fontes públicas");
  let leads: Lead[] = [];
  try { leads = await collect(query); } catch (error) { console.warn("public source unavailable", error); }
  emit("normalizacao", "Normalizando nomes e endereços", leads.length); await wait(180);
  leads = leads.map((l, i) => ({ ...l, id: l.id || `lead:${i}` }));
  emit("deduplicacao", "Removendo registros repetidos", leads.length); await wait(180);
  leads = dedupe(leads);
  emit("verificacao", "Verificando campos públicos e origem", leads.length); await wait(180);
  leads = leads.map(l => ({ ...l, status: l.confidence >= 70 ? "Verificado" : "Revisar" }));
  emit("score", "Calculando score de confiança", leads.length); await wait(180);
  leads.sort((a, b) => b.confidence - a.confidence);
  emit("finalizando", "Organizando leads na tabela local", leads.length);
  return leads;
}
app.get("/health", (_req, res) => res.json({ ok: true, service: "olho-de-deus", pipeline: "osint-publico", source: "photon-osm" }));
app.post("/api/capture", async (req, res) => {
  const query = String(req.body?.query || "").trim();
  if (!query) return res.status(400).json({ error: "Informe um nicho, empresa ou localidade." });
  try { const leads = await pipeline(query, () => undefined); return res.json({ query, count: leads.length, leads }); }
  catch { return res.status(502).json({ error: "A fonte pública não respondeu. Tente novamente em alguns instantes." }); }
});
app.get("/api/capture/stream", async (req, res) => {
  const query = String(req.query.query || "").trim();
  if (!query) return res.status(400).json({ error: "Informe um nicho, empresa ou localidade." });
  res.setHeader("Content-Type", "text/event-stream"); res.setHeader("Cache-Control", "no-cache"); res.setHeader("Connection", "keep-alive");
  const send = (payload: any) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  try { const leads = await pipeline(query, (stage, message, count) => send({ type: "progress", stage, message, count })); send({ type: "complete", query, count: leads.length, leads }); }
  catch { send({ type: "error", message: "A fonte pública não respondeu. Tente novamente." }); }
  res.end();
});

async function setupVite() {
  if (process.env.NODE_ENV !== "production") { const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" }); app.use(vite.middlewares); }
  else { const distPath = path.join(process.cwd(), "dist"); app.use(express.static(distPath)); app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html"))); }
  app.listen(PORT, "0.0.0.0", () => console.log(`Olho de Deus running on ${PORT}`));
}
setupVite();
