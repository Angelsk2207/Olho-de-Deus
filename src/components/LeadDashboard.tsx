import React, { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, Search, ShieldCheck, Sparkles, Users } from "lucide-react";

interface Lead { id: string; name: string; address: string; phone: string; website: string; category: string; source: string; confidence: number; status: string; }
const stages = ["coordenador", "coleta", "normalizacao", "deduplicacao", "verificacao", "score", "finalizando"];
const stageLabel: Record<string, string> = { coordenador: "Coordenando agentes", coleta: "Buscando fontes públicas", normalizacao: "Normalizando dados", deduplicacao: "Deduplicando registros", verificacao: "Verificando sinais", score: "Calculando confiança", finalizando: "Finalizando organização" };

export default function LeadDashboard() {
  const [query, setQuery] = useState("");
  const [leads, setLeads] = useState<Lead[]>(() => { try { return JSON.parse(localStorage.getItem("olho-leads") || "[]"); } catch { return []; } });
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState("");
  const [message, setMessage] = useState("Pronto para uma nova captura");
  const [error, setError] = useState("");
  const [sourceCount, setSourceCount] = useState(0);
  useEffect(() => localStorage.setItem("olho-leads", JSON.stringify(leads)), [leads]);
  const verified = useMemo(() => leads.filter(l => l.status === "Verificado").length, [leads]);
  const capture = () => {
    const term = query.trim(); if (!term || running) { if (!term) setError("Digite um nicho ou localidade para iniciar."); return; }
    setRunning(true); setError(""); setLeads([]); setSourceCount(0); setStage("coordenador"); setMessage("Coordenador preparando a captura");
    const stream = new EventSource(`/api/capture/stream?query=${encodeURIComponent(term)}`);
    stream.onmessage = event => { const data = JSON.parse(event.data); if (data.type === "progress") { setStage(data.stage); setMessage(data.message); if (data.count !== undefined) setSourceCount(data.count); } if (data.type === "complete") { setLeads(data.leads || []); setSourceCount(data.count || 0); setStage("finalizando"); setMessage(`${data.count || 0} leads organizados na tabela local`); setRunning(false); stream.close(); } if (data.type === "error") { setError(data.message); setRunning(false); stream.close(); } };
    stream.onerror = () => { if (running) { setError("Não foi possível concluir a captura. Tente novamente."); setRunning(false); } stream.close(); };
  };
  return <main className="shell">
    <header className="topbar"><div className="brand"><div className="brand-mark"><Sparkles size={21} /></div><div><strong>Olho de Deus</strong><span>inteligência pública para prospecção</span></div></div><div className="online"><span /> Sistema online</div></header>
    <section className="hero"><div className="eyebrow"><Activity size={15} /> CAPTURA AUTÔNOMA</div><h1>Encontre oportunidades<br /><em>com um único comando.</em></h1><p>Agentes trabalham em sequência: coletam, organizam, verificam e entregam uma base pronta para você.</p><div className="capture-box"><Search size={20} /><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && capture()} placeholder="Ex.: clínicas odontológicas em Belo Horizonte" disabled={running} /><button onClick={capture} disabled={running}>{running ? <span className="spinner" /> : <Search size={18} />}{running ? "Capturando..." : "Capturar leads"}</button></div>{error && <div className="error">{error}</div>}</section>
    {running && <section className="progress-card"><div className="progress-head"><div><b>{message}</b><small>Os agentes estão trabalhando automaticamente</small></div><span className="spinner dark" /></div><div className="steps">{stages.map((s, i) => <div className={stages.indexOf(stage) >= i ? "step active" : "step"} key={s}><span>{stages.indexOf(stage) > i ? "✓" : i + 1}</span>{stageLabel[s]}</div>)}</div></section>}
    <section className="stats"><div><Users /><b>{leads.length}</b><small>Leads na tabela</small></div><div><ShieldCheck /><b>{verified}</b><small>Verificados</small></div><div><CheckCircle2 /><b>{sourceCount || leads.length}</b><small>Encontrados na fonte</small></div></section>
    <section className="table-card"><div className="table-head"><div><h2>Base de leads</h2><p>{leads.length ? "Dados armazenados somente nesta sessão do navegador." : "Os resultados da próxima captura aparecerão aqui."}</p></div><span className="badge">{leads.length} registros</span></div><div className="table-wrap"><table><thead><tr><th>Empresa / local</th><th>Endereço</th><th>Contato</th><th>Confiança</th><th>Status</th></tr></thead><tbody>{leads.length ? leads.map(lead => <tr key={lead.id}><td><strong>{lead.name}</strong><small>{lead.category} · {lead.source}</small></td><td>{lead.address}</td><td>{lead.phone || lead.website || "Não informado"}</td><td><div className="confidence"><i style={{ width: `${lead.confidence}%` }} /> <span>{lead.confidence}%</span></div></td><td><span className={lead.status === "Verificado" ? "status good" : "status review"}>{lead.status}</span></td></tr>) : <tr><td colSpan={5} className="empty">Nenhum lead capturado ainda.</td></tr>}</tbody></table></div></section>
    <footer>Fontes públicas acessadas com respeito a limites de uso · Sem login, sem etapas manuais</footer>
  </main>;
}
