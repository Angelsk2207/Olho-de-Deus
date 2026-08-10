import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = Number(process.env.PORT) || 3000;
app.use(express.json({ limit: "1mb" }));
const UA = "OlhoDeDeus/3.0 (public OSINT; respectful research; contact: lead-search)";
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface Lead {
  id: string; name: string; address: string; category: string; source: string;
  website: string; phone: string; email: string; socials: string[];
  contactName: string; responsibleName: string; evidence: string[];
  enrichmentStatus: string; confidence: number; status: string;
}
const empty = (v: any) => !v || String(v).trim() === "";
function normalize(item: any, index: number): Lead {
  const p = item.properties || {};
  const name = String(p.name || p.operator || "Local sem nome").trim();
  const address = [p.street, p.housenumber, p.city, p.state, p.country].filter(Boolean).join(", ") || "Endereço não informado";
  const phone = String(p.phone || p.contact?.phone || "").trim();
  const website = String(p.website || p.contact?.website || "").trim();
  return { id: `osm:${p.osm_type || "feature"}:${p.osm_id || index}`, name, address,
    category: String(p.osm_value || p.type || "empresa"), source: "OpenStreetMap / Photon", website, phone,
    email: "", socials: [], contactName: "", responsibleName: "", evidence: [],
    enrichmentStatus: "Pendente", confidence: website || phone ? 60 : 40, status: "Novo" };
}
function dedupe(leads: Lead[]) { const seen = new Set<string>(); return leads.filter(l => { const key = `${l.name.toLowerCase()}|${l.address.toLowerCase()}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
async function collect(query: string): Promise<Lead[]> {
  const q = query.replace(/\bpadarias\b/gi,"padaria").replace(/\bclínicas\b/gi,"clínica").replace(/\bacademias\b/gi,"academia").replace(/\s+/g," ").trim();
  const r = await axios.get("https://photon.komoot.io/api/", { params: { q: q.slice(0,180), limit: 20 }, headers: { "User-Agent": UA }, timeout: 12000 });
  return dedupe((r.data?.features || []).map(normalize));
}
function cleanUrl(raw: string) { try { const u = new URL(raw); if (!["http:","https:"].includes(u.protocol)) return ""; return u.toString(); } catch { return ""; } }
function resolveSearchUrl(raw: string) {
  try {
    raw = raw.replace(/&amp;/gi, "&");
    const u = new URL(raw);
    const encoded = u.searchParams.get("u");
    if (encoded?.startsWith("a1")) return cleanUrl(Buffer.from(encoded.slice(2), "base64").toString("utf8"));
    return cleanUrl(raw);
  } catch { return ""; }
}
function absolute(href: string, base: string) { try { return new URL(href, base).toString(); } catch { return ""; } }
function textOf(html: string) { return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim(); }
function extract(html: string, url: string) {
  const text = textOf(html);
  const phones = Array.from(new Set((text.match(/(?:\+?\d[\d ()().-]{7,}\d)/g) || []).map(x => x.trim()).filter(x => x.replace(/\D/g,"").length >= 8))).slice(0,5);
  const emails = Array.from(new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(x => x.toLowerCase()))).filter(x => !x.includes("example.")).slice(0,5);
  const socials = Array.from(new Set((html.match(/https?:\/\/[^"'<> ]+\/(?:instagram|facebook|linkedin|tiktok|youtube)[^"'<> ]*/gi) || []).map(x => x.replace(/&amp;/g,"&")))).slice(0,8);
  // Only accept a name when a page explicitly labels it as owner/partner/director/contact.
  const names: string[] = [];
  const re = /(?:propriet[aá]ri[oa]|owner|fundador(?:a)?|s[oó]ci[oa]|diretor(?:a)?|respons[aá]vel|contato)\s*[:\-–]\s*([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+){1,4})/g;
  let m; while ((m = re.exec(text)) && names.length < 3) names.push(m[1].trim());
  return { phones, emails, socials, names, evidence: [url] };
}
async function robotsAllowed(url: string) {
  try { const u = new URL(url); const r = await axios.get(`${u.origin}/robots.txt`, { headers: { "User-Agent": UA }, timeout: 5000, validateStatus: s => s < 500 }); if (r.status === 404) return true; const lines = String(r.data).split(/\r?\n/); let applies = false; for (const line of lines) { const [k,v] = line.split("#")[0].split(":").map(s => s.trim().toLowerCase()); if (k === "user-agent") applies = v === "*" || v.includes("olhodededeus"); if (applies && k === "disallow" && v && new URL(url).pathname.startsWith(v)) return false; } return true; } catch { return true; }
}
async function ddgSites(lead: Lead) {
  const query = `"${lead.name}" "${lead.address.split(",").slice(-2).join(" ")}" contato OR telefone`;
  const found: string[] = [];
  try {
    const r = await axios.get("https://html.duckduckgo.com/html/", { params: { q: query.slice(0,220) }, headers: { "User-Agent": UA }, timeout: 10000 });
    const re = /class="result__a"[^>]*href="([^"]+)/gi; let m;
    while ((m = re.exec(String(r.data))) && found.length < 5) { let raw=m[1].replace(/&amp;/g,"&"); try { const parsed=new URL(raw,"https://html.duckduckgo.com"); raw=parsed.searchParams.get("uddg")||raw; } catch {} const u=cleanUrl(raw); if(u&&!/duckduckgo\.com|youtube\.com|wikipedia\.org/i.test(u)) found.push(u); }
  } catch { /* try the second public index */ }
  // Bing's public HTML is a keyless fallback when DDG serves a challenge page.
  if (!found.length) try {
    const r=await axios.get("https://www.bing.com/search",{params:{q:query.slice(0,220)},headers:{"User-Agent":UA},timeout:10000});
    const re=/<li[^>]*class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]+href="([^"]+)/gi; let m;
    while((m=re.exec(String(r.data)))&&found.length<5){const u=resolveSearchUrl(m[1]);if(u&&!/bing\.com|youtube\.com|wikipedia\.org/i.test(u))found.push(u);}
  } catch {}
  return found;
}
async function enrichLead(lead: Lead) {
  let candidates = lead.website ? [cleanUrl(lead.website)] : []; if (!candidates[0]) candidates = await ddgSites(lead);
  for (const candidate of candidates.slice(0,3)) { if (!candidate || !(await robotsAllowed(candidate))) continue; try {
      const r = await axios.get(candidate, { headers: { "User-Agent": UA, Accept: "text/html" }, timeout: 9000, maxContentLength: 800000, validateStatus: s => s >= 200 && s < 400 });
      const x = extract(String(r.data), candidate); lead.website = candidate; lead.phone ||= x.phones[0] || ""; lead.email ||= x.emails[0] || ""; lead.socials = Array.from(new Set([...lead.socials, ...x.socials]));
      if (x.names[0]) { lead.contactName = x.names[0]; lead.responsibleName = x.names[0]; }
      lead.evidence = Array.from(new Set([...lead.evidence, ...x.evidence])); break;
    } catch { /* public site unavailable; continue to next candidate */ }
    await wait(1000);
  }
  const fields = [lead.website, lead.phone, lead.email, lead.socials.length, lead.responsibleName].filter(Boolean).length;
  lead.enrichmentStatus = fields ? (lead.phone || lead.email || lead.responsibleName ? "Contato público encontrado" : "Site público sem contatos") : "Não encontrado em fontes públicas";
  lead.confidence = Math.min(95, 35 + fields * 12 + (lead.phone || lead.email ? 10 : 0));
  lead.status = lead.phone || lead.email ? "Verificado" : "Revisar";
  return lead;
}
async function pipeline(query: string, emit: (stage: string, message: string, count?: number, extra?: any) => void) {
  emit("coordenador", "Coordenador preparando a captura"); await wait(150); emit("coleta", "Buscando em Photon/OSM e DuckDuckGo HTML");
  let leads: Lead[] = []; try { leads = await collect(query); } catch (e) { console.warn("public source unavailable", e); }
  emit("normalizacao", "Normalizando nomes e endereços", leads.length); await wait(150); emit("deduplicacao", "Removendo registros repetidos", leads.length); leads = dedupe(leads);
  emit("verificacao", "Enriquecendo contatos públicos, sem inferências", leads.length);
  let done = 0, found = 0; for (const lead of leads) { done++; const enriched = await enrichLead(lead); if (enriched.phone || enriched.email || enriched.responsibleName) found++; emit("enriquecimento", `${done}/${leads.length}: ${lead.name} — ${lead.enrichmentStatus}`, leads.length, { processed: done, found }); await wait(700); }
  emit("score", `Conferência concluída: ${found} com contato público`, leads.length); leads.sort((a,b) => b.confidence-a.confidence); emit("finalizando", "Organizando leads na tabela local", leads.length); return leads;
}
app.get("/health", (_req,res) => res.json({ ok:true, service:"olho-de-deus", pipeline:"osint-publico", sources:["Photon/OSM","DuckDuckGo HTML","sites públicos"], noGoogle:true }));
app.post("/api/capture", async (req,res) => { const query=String(req.body?.query||"").trim(); if(!query)return res.status(400).json({error:"Informe um nicho, empresa ou localidade."}); try { const leads=await pipeline(query,()=>undefined); res.json({query,count:leads.length,leads}); } catch { res.status(502).json({error:"As fontes públicas não responderam. Tente novamente em alguns instantes."}); } });
app.get("/api/capture/stream", async (req,res) => { const query=String(req.query.query||"").trim(); if(!query)return res.status(400).json({error:"Informe um nicho, empresa ou localidade."}); res.setHeader("Content-Type","text/event-stream"); res.setHeader("Cache-Control","no-cache"); res.setHeader("Connection","keep-alive"); const send=(p:any)=>res.write(`data: ${JSON.stringify(p)}\n\n`); try { const leads=await pipeline(query,(stage,message,count,extra)=>send({type:"progress",stage,message,count,...extra})); send({type:"complete",query,count:leads.length,leads}); } catch { send({type:"error",message:"As fontes públicas não responderam. Tente novamente."}); } res.end(); });
async function setupVite(){ if(process.env.NODE_ENV!=="production"){const vite=await createViteServer({server:{middlewareMode:true},appType:"spa"});app.use(vite.middlewares);}else{const distPath=path.join(process.cwd(),"dist");app.use(express.static(distPath));app.get("*",(_req,res)=>res.sendFile(path.join(distPath,"index.html")));} app.listen(PORT,"0.0.0.0",()=>console.log(`Olho de Deus running on ${PORT}`)); }
setupVite();
