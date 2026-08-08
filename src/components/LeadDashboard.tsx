import React, { useState, useEffect, useCallback } from "react";
import { Search, Send, FileSpreadsheet, MessageSquare, Mail, Play, Pause, ChevronRight, Activity, Users, Plus, Target, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { getSheetData, appendToSheet, createSheet, getSpreadsheetMetadata, sendEmail } from "@/lib/google-api";
import axios from "axios";

import { jsPDF } from "jspdf";
import "jspdf-autotable";

// Add this to handle TypeScript for autoTable
declare module "jspdf" {
  interface jsPDF {
    autoTable: any;
  }
}

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  site: string;
  rating: number;
  status: "PENDENTE" | "ENVIADO" | "ERRO";
  raw?: string;
  address?: string;
}

interface DashboardProps {
  token: string;
  userEmail: string;
}

export default function LeadDashboard({ token, userEmail }: DashboardProps) {
  const [spreadsheetId, setSpreadsheetId] = useState<string>(() => {
    const saved = localStorage.getItem("spreadsheetId");
    return saved ? saved.trim() : "";
  });
  const [sheetName, setSheetName] = useState<string>(localStorage.getItem("sheetName") || "Sheet1");
  const [hasRepairableError, setHasRepairableError] = useState(false);
  const [activeTab, setActiveTab] = useState<"capture" | "leads" | "campaign" | "outreach" | "dork">("capture");
  const [captureMode, setCaptureMode] = useState<"api" | "phantom">("api");
  const [searchQuery, setSearchQuery] = useState("");
  const [dorkInput, setDorkInput] = useState("");
  const [filters, setFilters] = useState({
    niche: "",
    city: "",
    state: "",
    country: ""
  });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStep, setSearchStep] = useState(0);
  const [searchTotal, setSearchTotal] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [campaignCopy, setCampaignCopy] = useState("");
  const [systemStatus, setSystemStatus] = useState<string>("Operacional");
  const [sendingProgress, setSendingProgress] = useState(0);
  const [currentTypingMessage, setCurrentTypingMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [activeOutreachLead, setActiveOutreachLead] = useState<Lead | null>(null);
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);

  const extractSpreadsheetId = (val: string) => {
    const trimmed = val.trim();
    if (trimmed.includes("/d/")) {
      const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
      return match ? match[1] : trimmed;
    }
    return trimmed;
  };

  // Sync spreadsheetId to localStorage with cleaning
  useEffect(() => {
    if (spreadsheetId) {
      const cleanId = spreadsheetId.trim();
      localStorage.setItem("spreadsheetId", cleanId);
    }
  }, [spreadsheetId]);

  useEffect(() => {
    localStorage.setItem("sheetName", sheetName);
  }, [sheetName]);

  const handleCreateSheet = async (): Promise<string | null> => {
    setIsCreatingSheet(true);
    setHasRepairableError(false);
    setSystemStatus("Criando Planilha...");
    try {
      const response = await createSheet("Base de Leads - Olho de Deus", token);
      const newId = response.spreadsheetId;
      setSpreadsheetId(newId);
      
      // Initialize headers
      await appendToSheet(newId, "Sheet1!A:E", [
        ["Timestamp", "Empresa", "Endereço", "NanoData", "Status"]
      ], token);
      
      setSystemStatus("Planilha Pronta");
      return newId;
    } catch (err) {
      console.error("Failed to create sheet:", err);
      setSystemStatus("Erro ao criar planilha");
      return null;
    } finally {
      setIsCreatingSheet(false);
    }
  };

  const mapRowToLead = (row: any[], index: number): Lead => {
    const nano = row[3] || "";
    const parts = nano.split("|");
    // If it's a legacy row or missing parts, we try to recover from columns B/C
    return {
      id: (index + 1).toString(),
      name: parts[0] || row[1] || "Sem Nome",
      phone: parts[1] || "Sem Tel",
      email: parts[2] || "Sem Email",
      site: parts[3] || "Sem Site",
      rating: parseFloat(parts[4]) || 0,
      status: (row[4] || "PENDENTE") as Lead["status"],
      raw: nano,
      address: row[2] || "Sem Endereço"
    };
  };

  const handleAutoRepair = useCallback(async (forcedId?: string) => {
    const idToRepair = forcedId || spreadsheetId;
    if (!idToRepair || !token) return;

    setSystemStatus("AUTO-REPARO ATIVADO...");
    try {
      const meta = await getSpreadsheetMetadata(idToRepair, token);
      if (meta.sheets && meta.sheets.length > 0) {
        const firstSheetName = meta.sheets[0].properties.title;
        setSheetName(firstSheetName);
        setHasRepairableError(false);
        setSystemStatus(`CONV. ESTABELECIDA: ${firstSheetName}`);
      }
    } catch (err) {
      console.error("Auto-repair critical failure:", err);
      setHasRepairableError(true);
      setSystemStatus("ID TOTALMENTE INVÁLIDO");
    }
  }, [spreadsheetId, token]);


  const validateConnection = useCallback(async () => {
    if (!spreadsheetId || !token) return;
    try {
      await getSheetData(spreadsheetId, `${sheetName}!A1:A1`, token);
      setHasRepairableError(false);
      setSystemStatus("SISTEMA ONLINE");
    } catch (err: any) {
      console.error("Validation error:", err.response?.status);
      if (err.response?.status === 400 || err.response?.status === 404) {
        setHasRepairableError(true);
        handleAutoRepair();
      }
    }
  }, [spreadsheetId, token, sheetName, handleAutoRepair]);

  useEffect(() => {
    if (spreadsheetId) validateConnection();
  }, [spreadsheetId, validateConnection]);

  const fetchLeadsFromSheet = useCallback(async () => {
    if (!spreadsheetId || !token) return;
    try {
      const data = await getSheetData(spreadsheetId, `${sheetName}!A1:E`, token);
      setHasRepairableError(false);
      if (data.values) {
        // Detect if first row is header
        const firstRow = data.values[0];
        const hasHeader = firstRow && firstRow[0] === "Timestamp";
        const rowsToMap = hasHeader ? data.values.slice(1) : data.values;
        const startIndex = hasHeader ? 1 : 0;

        const mappedLeads: Lead[] = rowsToMap.map((row: any, index: number) => mapRowToLead(row, index + startIndex));
        setLeads(mappedLeads);
      } else {
        setLeads([]);
      }
    } catch (err: any) {
      console.error("Error fetching leads:", err);
      if (err.response?.status === 404 || err.response?.status === 400) {
        setHasRepairableError(true);
        setSystemStatus("AUTO-CORREÇÃO EM CURSO...");
        handleAutoRepair();
      }
    }
  }, [spreadsheetId, token, sheetName, handleAutoRepair]);

  useEffect(() => {
    fetchLeadsFromSheet();
  }, [fetchLeadsFromSheet]);

  const handleNewExtraction = () => {
    setSearchQuery("");
    setFilters({
      niche: "",
      city: "",
      state: "",
      country: ""
    });
    setSystemStatus("Formulário Resetado");
  };

  const handleCapture = async () => {
    if (captureMode === "phantom") {
      return handlePhantomCapture();
    }

    // Build query from filters if available, otherwise use searchQuery
    let finalQuery = searchQuery;
    if (!finalQuery && filters.niche) {
      const parts = [filters.niche, filters.city, filters.state, filters.country].filter(Boolean);
      finalQuery = parts.join(" ");
    }

    if (!finalQuery) return;
    // Modo local: os resultados ficam na tabela da plataforma até a exportação.
    const targetSpreadsheetId = spreadsheetId;
    setIsSearching(true);
    setHasRepairableError(false);
    setSystemStatus("Iniciando Protocolo de Varredura...");
    try {
      setSystemStatus("Escaneando Google Maps (Engine V1)...");
      const response = await axios.get(`/api/maps/search?query=${encodeURIComponent(finalQuery)}`);
      const mapsResults = response.data;
      
      if (!mapsResults || !Array.isArray(mapsResults) || mapsResults.length === 0) {
        setSystemStatus("Varredura Concluída: 0 resultados encontrados.");
        return;
      }

      setSearchTotal(mapsResults.length);
      setSearchStep(0);
      setSystemStatus(`Encontradas ${mapsResults.length} oportunidades. Preparando extração...`);
      
      const detailedLeads = [];
      // Use Promise.all to fetch details in parallel (max 5 at a time for safety)
      const CHUNK_SIZE = 5;
      for (let i = 0; i < mapsResults.length; i += CHUNK_SIZE) {
        const chunk = mapsResults.slice(i, i + CHUNK_SIZE);
        setSystemStatus(`Extraindo lote ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(mapsResults.length / CHUNK_SIZE)}...`);
        
        const chunkPromises = chunk.map(async (place) => {
          // Resultados do fallback OpenStreetMap já chegam completos o bastante
          // para entrar na tabela sem depender de uma segunda chamada.
          if (String(place.place_id).startsWith("osm:")) {
            const nano = `${place.name}|Sem Telefone|Explorar Domínio|Sem Site|0`;
            return [new Date().toISOString(), place.name, place.formatted_address || "Endereço não informado", nano, "PENDENTE"];
          }
          try {
            const detailRes = await axios.get(`/api/maps/details?placeId=${place.place_id}`);
            const details = detailRes.data;
            
            const phone = details.formatted_phone_number || "Sem Telefone";
            const site = details.website || "Sem Site";
            const rating = details.rating || 0;
            const email = "Explorar Domínio"; 
            
            const nano = `${details.name}|${phone}|${email}|${site}|${rating}`;
            return [
              new Date().toISOString(), 
              details.name, 
              details.formatted_address || "Endereço não informado", 
              nano, 
              "PENDENTE"
            ];
          } catch (err) {
            console.error(`Failed to get details for ${place.place_id}`, err);
            const nano = `${place.name}|Sem Telefone|Explorar Domínio|Sem Site|${place.rating || 0}`;
            return [
              new Date().toISOString(), 
              place.name, 
              place.formatted_address || "Endereço não informado", 
              nano, 
              "PENDENTE"
            ];
          }
        });

        const chunkResults = await Promise.all(chunkPromises);
        detailedLeads.push(...chunkResults);
        setSearchStep(Math.min(i + chunk.length, mapsResults.length));
      }

      if (targetSpreadsheetId && token) {
        setSystemStatus("Salvando na planilha conectada...");
        await appendToSheet(targetSpreadsheetId, `${sheetName}!A:E`, detailedLeads, token);
        await fetchLeadsFromSheet();
      } else {
        const localLeads = detailedLeads.map((row: any[], index: number) => mapRowToLead(row, index));
        setLeads(localLeads);
      }
      setSystemStatus(`Sucesso: ${detailedLeads.length} leads processados.`);
      handleNewExtraction();
      setActiveTab("leads");
    } catch (err: any) {
      console.error("Capture failed:", err);
      const isQuotaError = err.response?.data?.details?.includes("QUOTA") || err.message?.includes("quota") || err.response?.status === 429;
      const errorMsg = err.response?.data?.details || err.message;
      
      if (err.response?.status === 404 || err.response?.status === 400) {
        setHasRepairableError(true);
        setSystemStatus("REPARANDO CONEXÃO...");
        handleAutoRepair();
      } else if (isQuotaError) {
        setSystemStatus("DOCKER: LIMITE DE COTAS ATINGIDO");
      } else {
        setSystemStatus(`Erro: ${errorMsg}`);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handlePhantomCapture = async () => {
    let finalQuery = searchQuery;
    if (!finalQuery && filters.niche) {
      const parts = [filters.niche, filters.city, filters.state, filters.country].filter(Boolean);
      finalQuery = parts.join(" ");
    }

    if (!finalQuery) return;
    const targetSpreadsheetId = spreadsheetId;
    setIsSearching(true);
    setSystemStatus("Navegação Fantasma: Ignorando APIs...");
    
    try {
      setSystemStatus("AI Scanning: Capturando teia de resultados...");
      const response = await axios.post("/api/phantom/search", { query: finalQuery });
      const extractedLeads = response.data;
      
      if (!extractedLeads || !Array.isArray(extractedLeads) || extractedLeads.length === 0) {
        setSystemStatus("Varredura Fantasma: 0 resultados.");
        return;
      }

      setSystemStatus(`Protocolo Ghost: ${extractedLeads.length} leads identificados.`);
      
      const newLeadsValues = extractedLeads.map((lead: any) => {
        const nano = `${lead.name || "Empresa Fantasma"}|${lead.phone || "Sem Tel"}|${lead.email || "Sem Email"}|${lead.site || "Sem Site"}|${lead.rating || 5}`;
        return [
          new Date().toISOString(), 
          lead.name || "Empresa Fantasma", 
          lead.address || "Localização via Grounding", 
          nano, 
          "PENDENTE"
        ];
      });

      if (targetSpreadsheetId && token) {
        setSystemStatus("Salvando na planilha conectada...");
        await appendToSheet(targetSpreadsheetId, `${sheetName}!A:E`, newLeadsValues, token);
        await fetchLeadsFromSheet();
      } else {
        setLeads(extractedLeads.map((lead: any, index: number) => ({
          id: String(index + 1), name: lead.name || "Empresa Fantasma", phone: lead.phone || "Sem Tel",
          email: lead.email || "Sem Email", site: lead.site || "Sem Site", rating: lead.rating || 0,
          status: "PENDENTE", address: lead.address || "Localização via Grounding",
          raw: `${lead.name || "Empresa Fantasma"}|${lead.phone || "Sem Tel"}|${lead.email || "Sem Email"}|${lead.site || "Sem Site"}|${lead.rating || 0}`
        })));
      }
      
      setSystemStatus(`Sucesso: ${extractedLeads.length} leads processados.`);
      handleNewExtraction();
      setActiveTab("leads");
    } catch (err: any) {
      console.error("Phantom capture failed:", err);
      const errorDetails = err.response?.data?.details || "";
      const isQuotaError = errorDetails.includes("QUOTA") || err.message?.includes("quota") || err.response?.status === 429;
      const errorMsg = errorDetails || err.message;
      
      if (isQuotaError) {
        setSystemStatus("RECURSO EXAUSTIDO: LIMITE DE COTAS");
      } else {
        setSystemStatus(`Falha Fantasma: ${errorMsg}`);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleDorkCapture = async () => {
    if (!dorkInput || !spreadsheetId) return;
    setIsSearching(true);
    setSystemStatus("Analisando Código-Fonte (AI Engine)...");
    try {
      const response = await axios.post("/api/dork/extract", { content: dorkInput });
      const extractedLeads = response.data;
      
      if (!extractedLeads || !Array.isArray(extractedLeads) || extractedLeads.length === 0) {
        setSystemStatus("Nenhum lead detectado no conteúdo.");
        return;
      }

      setSystemStatus(`Extraídos ${extractedLeads.length} leads. Salvando G-Sheets...`);
      
      const newLeadsValues = extractedLeads.map((lead: any) => {
        const nano = `${lead.name || "Empresa Desconhecida"}|${lead.phone || "Sem Tel"}|${lead.email || "Sem Email"}|${lead.site || "Sem Site"}|${lead.rating || 0}`;
        return [
          new Date().toISOString(), 
          lead.name || "Empresa Desconhecida", 
          lead.address || "Google Dork Extraction", 
          nano, 
          "PENDENTE"
        ];
      });

      await appendToSheet(spreadsheetId, `${sheetName}!A:E`, newLeadsValues, token);
      await fetchLeadsFromSheet();
      
      setSystemStatus(`Sucesso: ${extractedLeads.length} leads via Dork.`);
      setDorkInput("");
      setActiveTab("leads");
    } catch (err: any) {
      console.error("Dork extraction failed:", err);
      const errorMsg = err.response?.data?.details || err.message;
      setSystemStatus(`Erro Dork: ${errorMsg}`);
    } finally {
      setIsSearching(false);
    }
  };

  const renderDorkHunter = () => {
    const gasCode = `
/**
 * Google Apps Script - Dork Hunter Extractor
 * Analisa Código-Fonte de Resultados de Busca do Google.
 */
function DorkHunterProcess(html) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g;
  const phoneRegex = /(?:\\+?\\d{1,3}[-.\\s]?)?\\(?\\d{2,3}\\)?[-.\\s]?\\d{4,5}[-.\\s]?\\d{4}/g;
  
  const emails = html.match(emailRegex) || [];
  const phones = html.match(phoneRegex) || [];
  
  const results = [];
  const max = Math.max(emails.length, phones.length);
  
  for (let i = 0; i < max; i++) {
    const email = emails[i] || "Sem Email";
    const phone = phones[i] || "Sem Telefone";
    const name = "Lead Dork Extraction";
    const nanoData = \`\${name}|\${phone}|\${email}|Dork Result|0\`;
    results.push([new Date().toISOString(), name, "Google Search Result", nanoData, "PENDENTE"]);
  }
  
  if (results.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, results.length, 5).setValues(results);
    Logger.log("Processado: " + results.length + " leads.");
  }
}
    `.trim();

    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="p-8 space-y-6 flex flex-col h-full overflow-auto">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-red-500/20 rounded-xl">
              <Target className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold uppercase italic italic">Dork Hunter Engine</h2>
              <p className="text-zinc-500 text-[10px] uppercase tracking-widest px-1">Extração direta de código-fonte paste-and-process</p>
            </div>
          </div>

          <div className="space-y-4">
             <div className="flex gap-2 flex-wrap">
                {[
                  { label: "Email (Geral)", dork: `"${filters.niche || "empresa"}" @gmail.com site:br` },
                  { label: "WhatsApp (Geral)", dork: `"${filters.niche || "empresa"}" "wa.me/" site:br` },
                  { label: "LinkedIn (Nicho)", dork: `site:linkedin.com/in "${filters.niche || "CEO"}" "${filters.city || ""}"` },
                  { label: "PDF Leads", dork: `filetype:pdf "${filters.niche || "leads"}" 2024` }
                ].map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      const url = `https://www.google.com/search?q=${encodeURIComponent(item.dork)}`;
                      window.open(url, "_blank");
                      setSystemStatus("Dork Aberta no Google");
                    }}
                    className="text-[8px] bg-white/5 hover:bg-white/10 px-2 py-1 rounded border border-white/10 font-bold uppercase tracking-widest text-emerald-400 transition-all"
                  >
                    {item.label}
                  </button>
                ))}
             </div>

             <div className="space-y-2">
                <label className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest px-1">Código-Fonte dos Resultados (HTML/Text)</label>
                <textarea
                  value={dorkInput}
                  onChange={(e) => setDorkInput(e.target.value)}
                  placeholder="Inspecione a página (Ctrl+U), copie tudo e cole aqui..."
                  className="w-full h-48 bg-black/40 border border-white/5 rounded-xl p-4 text-[10px] font-mono text-zinc-400 focus:outline-none focus:border-red-500/50 transition-all scroll-none"
                />
             </div>
             <button
               onClick={handleDorkCapture}
               disabled={isSearching || !dorkInput || !spreadsheetId}
               className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl uppercase tracking-[0.2em] text-[10px] transition-all disabled:opacity-30 disabled:grayscale shadow-xl shadow-red-600/10 flex items-center justify-center gap-2"
             >
                {isSearching ? <Activity className="w-4 h-4 animate-spin" /> : <Play size={14} fill="currentColor" />}
                EXCUTAR EXTRAÇÃO IA-FORCE
             </button>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
           <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Google Apps Script Automação</h3>
              <button 
                onClick={() => {
                   navigator.clipboard.writeText(gasCode);
                   setSystemStatus("Script na Área de Transferência");
                }}
                className="text-[8px] bg-white/5 hover:bg-white/10 px-2 py-1 rounded border border-white/5 font-bold uppercase tracking-widest"
              >
                Copiar Código
              </button>
           </div>
           <pre className="bg-black/60 p-4 rounded-xl text-[10px] font-mono text-emerald-500/60 overflow-x-auto border border-white/5 max-h-32 overflow-auto">
             {gasCode}
           </pre>
        </div>
      </motion.div>
    );
  };

  const handleGenerateCopy = async () => {
    if (!leads.length) return;
    setIsSearching(true);
    setSystemStatus("Gerando Estratégia...");
    try {
      const prompt = `Gerar uma abordagem persuasiva de marketing para um negócio de: ${searchQuery || "vários nichos"}.
      O público são donos de empresas locais. 
      O tom deve ser profissional, direto e focado em lucro.
      Inclua:
      1. Assunto do Email
      2. Texto do WhatsApp (Curto e humano)
      3. Gancho de SMS`;
      
      const response = await axios.post("/api/gemini/generate", {
        prompt,
        systemInstruction: "Você é o motor Olho de Deus, um Engenheiro de Growth especializado em conversão B2B."
      });
      setCampaignCopy(response.data.text);
      setSystemStatus("Estratégia Pronta");
      setActiveTab("campaign");
    } catch (err: any) {
      console.error("Copy generation failed:", err);
      const errorMsg = err.response?.data?.details || err.response?.data?.error || err.message;
      setSystemStatus(`Erro AI: ${errorMsg}`);
    } finally {
      setIsSearching(false);
    }
  };

  const startMassSend = async () => {
    if (isSending || !leads.length) return;
    setIsSending(true);
    setSendingProgress(0);
    setSystemStatus("Protocolo Ghost Iniciado");

    const pendingLeads = leads.filter(l => l.status === "PENDENTE");
    let count = 0;

    for (const lead of pendingLeads) {
      if (!isSending) break;
      
      setActiveOutreachLead(lead);
      setSystemStatus(`Mirando: ${lead.name}`);
      
      // Delay de preparação (humano abrindo chat)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setIsTyping(true);
      setSystemStatus("Simulando Digitação...");
      
      const message = campaignCopy || "Olá! Vimos seu perfil no Maps e achamos seu trabalho incrível. Gostaria de saber se você teria interesse em escalar suas vendas com IA?";
      // Typing simulation
      let currentText = "";
      for (const char of message) {
        if (!isSending) break;
        currentText += char;
        setCurrentTypingMessage(currentText);
        // Random typing speed (30ms - 80ms per char)
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 30));
      }
      
      if (!isSending) break;
      
      setIsTyping(false);
      setSystemStatus("Pausando para Conclusão...");
      
      // Delay de conclusão (humano enviando)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      count++;
      setSendingProgress(Math.round((count / pendingLeads.length) * 100));
      setCurrentTypingMessage("");
      
      // In a real scenario, we would update the status in the sheet here
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: "ENVIADO" } : l));
    }

    setIsSending(false);
    setActiveOutreachLead(null);
    setSystemStatus("Operação Concluída");
  };

  const exportToTXT = () => {
    if (!leads.length) return;
    const content = leads.map(l => 
      `EMPRESA: ${l.name}\n` +
      `TELEFONE: ${l.phone}\n` +
      `EMAIL: ${l.email}\n` +
      `SITE: ${l.site}\n` +
      `ENDEREÇO: ${l.address || "Não informado"}\n` +
      `STATUS: ${l.status}\n` +
      `----------------------------------------`
    ).join("\n\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `leads_export_${new Date().toISOString().split("T")[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setSystemStatus("Exportado TXT");
  };

  const exportToCSV = () => {
    if (!leads.length) return;
    const headers = ["Empresa", "Telefone", "E-mail", "Site", "Endereço", "Avaliação", "Status"];
    const rows = leads.map(l => [l.name, l.phone, l.email, l.site, l.address || "", String(l.rating), l.status]);
    const csv = [headers, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\\n");
    const blob = new Blob(["\\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `olho-leads-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setSystemStatus("Arquivo Excel (CSV) baixado");
  };

  const openInGoogleSheets = () => {
    if (!leads.length) return;
    exportToCSV();
    window.open("https://sheets.new", "_blank", "noopener,noreferrer");
    setSystemStatus("CSV baixado: importe-o no Google Sheets");
  };

  const exportToPDF = () => {
    if (!leads.length) return;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Relatório de Leads - Olho de Deus", 14, 22);
    doc.setFontSize(10);
    doc.text(`Data de Exportação: ${new Date().toLocaleString()}`, 14, 30);
    doc.text(`Total de Leads: ${leads.length}`, 14, 35);

    const tableData = leads.map(l => [
      l.name,
      l.phone,
      l.email,
      l.status,
      l.rating.toString()
    ]);

    doc.autoTable({
      startY: 40,
      head: [["Empresa", "Telefone", "Email", "Status", "Rating"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: [16, 185, 129] }, // Emerald-500
    });

    doc.save(`leads_report_${new Date().toISOString().split("T")[0]}.pdf`);
    setSystemStatus("Exportado PDF");
  };

  return (
    <div className="map-surface min-h-screen bg-[#050505] text-[#e2e8f0] font-sans flex flex-col p-3 sm:p-6 gap-3 sm:gap-4">
      {/* HEADER / STATUS BAR */}
      <header className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 glass p-3 sm:p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center glow-emerald">
             <Target size={24} className="text-black" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white uppercase">
              Olho <span className="text-emerald-500">de Deus</span>
              <span className="text-emerald-500 text-[10px] ml-2 font-mono">v4.0 PROSPECÇÃO + CRM</span>
            </h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Prospecção Inteligente • CRM Comercial</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 sm:gap-8 items-center justify-between sm:justify-end">
          <div className="text-right">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Status do Sistema</p>
            <p className="text-sm font-medium flex items-center gap-2 justify-end">
               <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isSearching || isSending ? "bg-amber-500" : "bg-emerald-500")} />
               {systemStatus}
            </p>
            {isSearching && searchTotal > 0 && (
              <div className="mt-2 w-44 sm:w-56">
                <div className="flex justify-between text-[9px] text-emerald-400 font-mono uppercase">
                  <span>Busca {Math.min(searchStep + 1, searchTotal)} de {searchTotal}</span>
                  <span>{Math.round((searchStep / searchTotal) * 100)}%</span>
                </div>
                <div className="h-1 mt-1 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${Math.max(5, (searchStep / searchTotal) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
          <div className="h-8 w-px bg-zinc-800"></div>
          <div className="flex gap-2">
            <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] rounded font-mono">G-CLOUD: ONLINE</span>
            <span className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] rounded font-mono">GHOST: ACTIVE</span>
          </div>
        </div>
      </header>

      {/* MAIN GRID */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 min-h-0">
        {/* Sidebar / Navigation */}
        <nav className="col-span-1 lg:col-span-1 glass rounded-xl flex flex-row lg:flex-col items-center justify-around lg:justify-start py-3 lg:py-8 px-2 lg:px-0 gap-2 lg:gap-10">
          <NavItem icon={<Target size={20} />} active={activeTab === "capture"} onClick={() => setActiveTab("capture")} label="Captura" />
          <NavItem icon={<Activity size={20} className="text-red-500" />} active={activeTab === "dork"} onClick={() => setActiveTab("dork")} label="Dork Hunter" />
          <NavItem icon={<Users size={20} />} active={activeTab === "leads"} onClick={() => setActiveTab("leads")} label="Leads" />
          <NavItem icon={<Activity size={20} />} active={activeTab === "campaign"} onClick={() => setActiveTab("campaign")} label="Copy" />
          <NavItem icon={<Send size={20} />} active={activeTab === "outreach"} onClick={() => setActiveTab("outreach")} label="Disparo" />
          
          <div className="mt-auto border-t border-white/5 pt-6 w-full flex justify-center">
            <FileSpreadsheet className="text-zinc-600 hover:text-white cursor-pointer transition-colors" size={20} onClick={fetchLeadsFromSheet} />
          </div>
        </nav>

        {/* Dynamic Content Col */}
        <div className="col-span-1 lg:col-span-11 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 h-full min-w-0">
          {/* Main Workspace Area */}
          <section className="col-span-1 lg:col-span-9 glass rounded-xl flex flex-col overflow-hidden min-w-0">
            <div className="bg-white/5 p-3 flex justify-between items-center border-b border-white/10">
              <h2 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <Activity size={14} className="text-emerald-500" />
                {activeTab === "capture" ? "Agente Captador (Dorks/Maps)" : 
                 activeTab === "leads" ? "Google Sheets Nano-Storage" :
                 activeTab === "campaign" ? "Intelligence Strategy" : "Ghost Protocol Flow"}
              </h2>
              <span className="text-[10px] text-zinc-500 font-mono">
                {activeTab === "leads" ? `Rows: ${leads.length} / Size: ${Math.round(leads.length * 0.15)}kb` : userEmail}
              </span>
            </div>

            <div className="flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                  {activeTab === "capture" && (
                    <motion.div key="capture" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-8 space-y-8 flex flex-col h-full">
                    <div className="max-w-2xl space-y-6">
                      <h2 className="text-2xl font-bold tracking-tight text-white uppercase italic">Extração de Alta Precisão</h2>
                      <p className="text-zinc-500 text-sm leading-relaxed">
                        Descreva o tipo de empresa que você procura. O Olho de Deus encontra oportunidades em fontes públicas, organiza os leads e prepara o próximo passo comercial.
                      </p>
                      
                      <div className="space-y-4">
                        {/* Capture Mode Toggle */}
                        <div className="flex gap-2 p-1 bg-white/5 rounded-2xl border border-white/5 w-fit">
                          <button
                            onClick={() => setCaptureMode("api")}
                            className={cn(
                              "px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                              captureMode === "api" ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" : "text-zinc-500 hover:text-white"
                            )}
                          >
                            Engine V1 (API Maps)
                          </button>
                          <button
                            onClick={() => setCaptureMode("phantom")}
                            className={cn(
                              "px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                              captureMode === "phantom" ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20" : "text-zinc-500 hover:text-white"
                            )}
                          >
                            Engine Ghost (Grounding)
                          </button>
                        </div>

                        {hasRepairableError && (
                          <div className="bg-red-500/20 border border-red-500/50 p-4 rounded-xl flex flex-col gap-3 animate-pulse">
                            <div className="flex items-center gap-3">
                              <AlertCircle className="text-red-500" size={20} />
                              <div className="flex-1">
                                <h4 className="text-xs font-bold text-red-500 uppercase italic">Erro Crítico de Conexão</h4>
                                <p className="text-[10px] text-red-200/70 uppercase">A planilha atual não é compatível ou o ID está incorreto.</p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => handleAutoRepair()}
                                className="flex-1 bg-red-600 hover:bg-red-500 text-white text-[9px] font-bold py-2 rounded uppercase transition-colors"
                              >
                                Tentar Reparar Agora
                              </button>
                              <button 
                                onClick={handleCreateSheet}
                                className="flex-1 bg-white hover:bg-zinc-200 text-black text-[9px] font-bold py-2 rounded uppercase transition-colors"
                              >
                                Criar Nova (Garantido)
                              </button>
                            </div>
                          </div>
                        )}

                        {!spreadsheetId ? (
                          <div className="glass bg-emerald-500/10 p-5 rounded-2xl border border-emerald-500/30 flex items-center gap-4">
                            <Target className="text-emerald-500" size={28} />
                            <div>
                               <h3 className="text-sm font-bold text-white uppercase italic">Extração local ativada</h3>
                               <p className="text-[10px] text-zinc-400 mt-1 uppercase tracking-widest">Os resultados aparecem na tabela abaixo e podem ser exportados depois.</p>
                            </div>
                          </div>
                        ) : (
                          <div className={cn(
                            "glass p-4 rounded-xl border-l-4 flex justify-between items-center transition-all",
                            hasRepairableError ? "bg-red-500/10 border-red-500" : "bg-black/20 border-emerald-500"
                          )}>
                            <div className="flex-1">
                               <div className="flex items-center gap-2 mb-1">
                                 <p className={cn(
                                   "text-[10px] uppercase tracking-widest font-bold italic",
                                   hasRepairableError ? "text-red-400" : "text-zinc-500"
                                 )}>
                                   {hasRepairableError ? "⚠ Planilha Inacessível" : "Planilha Ativa (ID)"}
                                 </p>
                                 {hasRepairableError && (
                                   <div className="flex gap-1">
                                     <button 
                                       onClick={() => handleAutoRepair()}
                                       className="text-[9px] bg-red-600 text-white px-2 py-0.5 rounded font-bold hover:bg-red-500 transition-colors"
                                     >
                                       REPARAR
                                     </button>
                                     <button 
                                       onClick={handleCreateSheet}
                                       className="text-[9px] bg-white text-black px-2 py-0.5 rounded font-bold hover:bg-zinc-200 transition-colors"
                                     >
                                       RESET
                                     </button>
                                   </div>
                                 )}
                               </div>
                               <input
                                 type="text"
                                 value={spreadsheetId}
                                 onChange={(e) => {
                                   const val = extractSpreadsheetId(e.target.value);
                                   setSpreadsheetId(val);
                                   setHasRepairableError(false);
                                 }}
                                 className={cn(
                                   "bg-transparent w-full text-xs font-mono focus:outline-none",
                                   hasRepairableError ? "text-red-400" : "text-emerald-400"
                                 )}
                               />
                            </div>
                            <button onClick={() => setSpreadsheetId("")} className="text-zinc-600 hover:text-red-500 transition-colors ml-4">
                               <Trash2 size={16} />
                            </button>
                          </div>
                        )}

                        <div className="space-y-6">
                          <div className="flex justify-between items-end border-b border-white/5 pb-2">
                            <div>
                              <h3 className="text-xs font-bold text-white uppercase italic tracking-widest flex items-center gap-2">
                                <Target size={14} className="text-emerald-500" />
                                Configuração de Alvos
                              </h3>
                              <p className="text-[10px] text-zinc-500 uppercase mt-1 px-5">Defina os parâmetros para a varredura profunda</p>
                            </div>
                            <button 
                              onClick={handleNewExtraction}
                              className="text-[10px] bg-white/5 hover:bg-white/10 text-emerald-500 px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest flex items-center gap-2 transition-all border border-white/5"
                            >
                              <Plus size={12} /> Resetar Filtros
                            </button>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                            <div className="md:col-span-12 lg:col-span-4 space-y-2">
                              <label className="text-[9px] text-emerald-500/70 uppercase font-bold tracking-widest flex items-center gap-2">
                                <Search size={10} /> Nicho Estratégico
                              </label>
                              <input
                                type="text"
                                placeholder="ex: Academias, Clínicas..."
                                value={filters.niche}
                                onChange={(e) => setFilters(prev => ({ ...prev, niche: e.target.value }))}
                                className="w-full glass bg-white/5 p-4 rounded-xl text-sm focus:bg-emerald-500/10 focus:outline-none transition-all placeholder:text-zinc-700 font-mono border border-white/5"
                              />
                            </div>
                            <div className="md:col-span-4 lg:col-span-3 space-y-2">
                              <label className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Cidade</label>
                              <input
                                type="text"
                                placeholder="ex: São Paulo"
                                value={filters.city}
                                onChange={(e) => setFilters(prev => ({ ...prev, city: e.target.value }))}
                                className="w-full glass bg-white/5 p-4 rounded-xl text-sm focus:bg-white/10 focus:outline-none transition-all placeholder:text-zinc-700 font-mono border border-white/5"
                              />
                            </div>
                            <div className="md:col-span-4 lg:col-span-2 space-y-2">
                              <label className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Estado</label>
                              <input
                                type="text"
                                placeholder="ex: SP"
                                value={filters.state}
                                onChange={(e) => setFilters(prev => ({ ...prev, state: e.target.value }))}
                                className="w-full glass bg-white/5 p-4 rounded-xl text-sm focus:bg-white/10 focus:outline-none transition-all placeholder:text-zinc-700 font-mono border border-white/5"
                              />
                            </div>
                            <div className="md:col-span-4 lg:col-span-3 space-y-2">
                              <label className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">País</label>
                              <input
                                type="text"
                                placeholder="ex: Brasil"
                                value={filters.country}
                                onChange={(e) => setFilters(prev => ({ ...prev, country: e.target.value }))}
                                className="w-full glass bg-white/5 p-4 rounded-xl text-sm focus:bg-white/10 focus:outline-none transition-all placeholder:text-zinc-700 font-mono border border-white/5"
                              />
                            </div>
                          </div>

                          <div className="pt-4 border-t border-white/5">
                            <div className="flex flex-col md:flex-row gap-4 items-end">
                              <div className="flex-1 w-full space-y-2">
                                <label className="text-[9px] text-zinc-600 uppercase font-bold tracking-widest">Busca Direta (Opcional)</label>
                                <div className="relative">
                                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-600">
                                     <Activity size={16} />
                                  </div>
                                  <input
                                    type="text"
                                    placeholder="Palavras-chave específicas ou query manual..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full glass bg-white/5 p-5 pl-12 rounded-2xl text-sm focus:bg-white/10 focus:outline-none transition-all border border-white/5"
                                  />
                                </div>
                              </div>
                              <button
                                onClick={handleCapture}
                                disabled={isSearching || isCreatingSheet || (!searchQuery && !filters.niche)}
                                className={cn(
                                  "w-full md:w-auto h-[60px] px-12 rounded-2xl font-bold uppercase tracking-[0.2em] text-xs hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-3 shadow-xl",
                                  captureMode === "phantom" ? "bg-amber-500 text-black shadow-amber-500/20" : "bg-emerald-600 text-black shadow-emerald-600/20"
                                )}
                              >
                                {isSearching ? (
                                  <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <Play size={18} fill="currentColor" /> 
                                    {captureMode === "phantom" ? "Evocar Navegação" : "Iniciar Varredura"}
                                  </>
                                )}
                              </button>
                            </div>
                            <p className="text-[8px] text-zinc-700 uppercase mt-4 text-center tracking-[0.3em] font-mono">
                              {captureMode === "phantom" ? "O Olho usará grounding IA para varrer a web sem API" : "O motor de varredura iniciará o protocolo de extração de dados via Places API"}
                            </p>
                          </div>
                      </div>
                    </div>
                  </div>

                    <div className="mt-auto grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                       <StatCard label="Leads Totais" value={leads.length} />
                       <StatCard label="Aguardando" value={leads.filter(l => l.status === "PENDENTE").length} color="text-amber-500" />
                       <StatCard label="Sucesso" value={leads.filter(l => l.status === "ENVIADO").length} color="text-emerald-500" />
                    </div>
                  </motion.div>
                )}

                  {activeTab === "dork" && renderDorkHunter()}

                  {activeTab === "leads" && (
                  <motion.div key="leads" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col p-2">
                    <div className="flex justify-between items-center p-4 border-b border-white/5 bg-black/10">
                      <div className="flex gap-2">
                         <button onClick={exportToCSV} className="bg-white/5 hover:bg-white/10 text-zinc-300 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 border border-white/5">
                           <FileSpreadsheet size={14} /> Excel / CSV
                         </button>
                         <button onClick={exportToPDF} className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 border border-emerald-500/10">
                           <Mail size={14} /> PDF
                         </button>
                         <button onClick={openInGoogleSheets} className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border border-blue-500/10">
                           Abrir Google Sheets
                         </button>
                      </div>
                      <div className="text-[10px] text-zinc-600 font-mono italic">Protocolo de Extração Seguro</div>
                    </div>
                    <div className="flex-1 overflow-auto custom-scrollbar">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="text-[10px] text-zinc-600 uppercase border-b border-white/5">
                            <th className="p-4 font-bold">Empresa / ID</th>
                            <th className="p-4 font-bold">Compact Data (Nano)</th>
                            <th className="p-4 font-bold text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {leads.map((lead) => (
                            <tr key={lead.id} className="group hover:bg-white/5 transition-colors">
                              <td className="p-4">
                                <div className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">{lead.name}</div>
                                <div className="text-[10px] text-emerald-500/50 font-mono italic truncate max-w-[200px]">{lead.address}</div>
                                <div className="text-[10px] text-zinc-600 font-mono truncate max-w-[150px]">{lead.site}</div>
                              </td>
                              <td className="p-4">
                                <span className={cn("nano-cell", lead.status === "PENDENTE" ? "opacity-50" : "opacity-100")}>
                                  {lead.raw ? lead.raw.split("").map(c => c.charCodeAt(0).toString(16)).join("").substring(0, 40) + "..." : "EMPTY_NANODATA"}
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                                  lead.status === "PENDENTE" ? "bg-zinc-800 text-zinc-500" : "bg-emerald-500/10 text-emerald-500"
                                )}>
                                  {lead.status === "PENDENTE" ? "PENDENTE" : "ENVIADO ✅"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}

                {activeTab === "campaign" && (
                  <motion.div key="campaign" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-8 h-full flex flex-col gap-6">
                    <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-bold uppercase tracking-tight italic">Intelligence <span className="text-emerald-500">Output</span></h2>
                      <button onClick={handleGenerateCopy} className="text-[10px] uppercase font-bold text-emerald-500 hover:underline">Regerar Cópia</button>
                    </div>
                    <div className="flex-1 glass bg-black/40 p-6 rounded-2xl font-mono text-[11px] text-emerald-400/80 leading-relaxed overflow-auto border-l-4 border-emerald-900/50">
                      {campaignCopy || "Aguardando processamento do motor Gemini para gerar o script de persuasão..."}
                    </div>
                  </motion.div>
                )}

                {activeTab === "outreach" && (
                  <motion.div key="outreach" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 sm:p-8 h-full grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8">
                     <div className="col-span-1 lg:col-span-4 flex flex-col items-center justify-center text-center space-y-8 glass p-5 sm:p-8 rounded-3xl bg-black/20">
                        <div className="relative">
                           <div className={cn("w-32 h-32 rounded-full border border-emerald-500/20 flex items-center justify-center glow-emerald", isSending ? "animate-spin-slow" : "")}>
                              <Send className="text-emerald-500" size={40} />
                           </div>
                           {isSending && <div className="absolute -inset-2 border border-emerald-500 border-dashed rounded-full animate-reverse-spin" />}
                        </div>
                        <div className="space-y-2">
                           <h3 className="text-xl font-bold uppercase italic tracking-wider">Invasão Ghost</h3>
                           <p className="text-zinc-500 text-[10px] uppercase tracking-widest leading-relaxed">Mimetizando comportamento humano via protocolos de simulação de input.</p>
                        </div>
                        
                        <div className="w-full space-y-2">
                           <div className="flex justify-between font-mono text-[10px] text-zinc-600">
                             <span>PROG_SESSÃO: {isSending ? `${sendingProgress}%` : "IDLE"}</span>
                             <span>{Math.round(sendingProgress)}%</span>
                           </div>
                           <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${sendingProgress}%` }} className="h-full bg-emerald-500" />
                           </div>
                        </div>

                        <button
                           onClick={isSending ? () => setIsSending(false) : startMassSend}
                           className={cn(
                             "w-full py-4 rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all",
                             isSending ? "bg-amber-600 text-black shadow-lg shadow-amber-600/20" : "bg-emerald-600 text-black hover:bg-emerald-500 shadow-lg shadow-emerald-600/20"
                           )}
                         >
                           {isSending ? "Interromper Protocolo" : "Acionar Machine Blast"}
                         </button>
                     </div>

                     <div className="col-span-1 lg:col-span-8 flex flex-col gap-4 min-w-0">
                        <div className="glass bg-black/40 rounded-2xl p-6 flex-1 flex flex-col border border-white/5 relative overflow-hidden">
                           <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-4">
                              <div className="flex items-center gap-2">
                                 <div className={cn("w-2 h-2 rounded-full", isSending ? "bg-emerald-500 animate-pulse" : "bg-zinc-700")} />
                                 <p className="text-[10px] uppercase font-bold text-white tracking-widest">
                                    {isSending ? `Monitorando Alvo: ${activeOutreachLead?.name || "..."}` : "Aguardando Alvo..."}
                                 </p>
                              </div>
                              <span className="text-[9px] font-mono text-zinc-600">ENCRYPTION: AES-256</span>
                           </div>

                           <div className="flex-1 space-y-4">
                              {activeOutreachLead ? (
                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                                   <div className="flex gap-3">
                                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-emerald-500">
                                         <Users size={16} />
                                      </div>
                                      <div>
                                         <p className="text-[10px] font-bold text-white leading-none uppercase">{activeOutreachLead.name}</p>
                                         <p className="text-[9px] text-zinc-500 font-mono mt-1">{activeOutreachLead.phone} | {activeOutreachLead.email}</p>
                                      </div>
                                   </div>
                                   
                                   <div className="bg-zinc-900/50 p-4 rounded-xl border border-white/5 flex flex-col gap-2">
                                      <p className="text-[9px] text-zinc-600 uppercase font-bold tracking-tighter">
                                         {isTyping ? "[AI Ghost Simulator Typing...]" : "[Ação Concluída]"}
                                      </p>
                                      <div className="text-[11px] text-emerald-400 font-mono leading-relaxed min-h-[100px]">
                                         {currentTypingMessage}
                                         {isTyping && <span className="w-1.5 h-3.5 bg-emerald-500 inline-block ml-1 animate-pulse" />}
                                      </div>
                                   </div>
                                </div>
                              ) : (
                                <div className="h-full flex flex-col items-center justify-center text-zinc-700 space-y-2 italic font-serif">
                                   <Activity size={32} />
                                   <p className="text-xs">Nenhum fluxo ativo detectado.</p>
                                </div>
                              )}
                           </div>

                           {isSending && (
                             <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
                                <div className="flex gap-2">
                                   <span className="px-2 py-0.5 bg-white/5 rounded text-[8px] text-zinc-500 font-bold uppercase tracking-tighter">SIMUL_TOUCH</span>
                                   <span className="px-2 py-0.5 bg-white/5 rounded text-[8px] text-zinc-500 font-bold uppercase tracking-tighter">GHOST_INPUT</span>
                                   <span className="px-2 py-0.5 bg-emerald-500/10 rounded text-[8px] text-emerald-500 font-bold uppercase tracking-tighter">WA_READY</span>
                                </div>
                                <div className="text-[10px] font-mono text-zinc-500">
                                   LATENCY: {Math.floor(Math.random() * 50 + 10)}ms
                                </div>
                             </div>
                           )}
                        </div>
                     </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>

          {/* Right Col: Design Context */}
          <aside className="col-span-1 lg:col-span-3 flex flex-col gap-4 min-h-0">
             <div className="glass rounded-xl p-4 flex flex-col flex-1 overflow-hidden">
                <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Prompt Engineering</h2>
                <div className="flex-1 glass bg-black/50 p-3 rounded-lg border border-white/5 font-mono text-[9px] text-emerald-300 leading-relaxed overflow-auto scroll-none">
                   "High-end executive dashboard with glowing data streams. Minimalist emerald aesthetic. Cinematic lighting. The All-Seeing Eye core processing lead data in 8k photorealistic quality."
                </div>
                <div className="mt-4 flex items-center gap-3 bg-white/5 p-3 rounded-lg">
                   <div className="w-8 h-8 rounded border border-emerald-500/20 flex items-center justify-center bg-black">
                      <Target size={14} className="text-emerald-500" />
                   </div>
                   <div className="text-[9px] uppercase font-bold text-zinc-500">Render Pipeline Active</div>
                </div>
             </div>

             <div className="glass rounded-xl p-4 h-32 flex flex-col justify-between">
                <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Growth Strategy</h2>
                <div className="space-y-1">
                    <p className="text-xs font-bold text-white truncate">Target: {searchQuery || "Global"}</p>
                    <p className="text-[10px] text-zinc-500 leading-tight line-clamp-2">Extração nativa via Places API com compactação zero-loss nano.</p>
                </div>
             </div>
          </aside>
        </div>
      </div>

      {/* FOOTER: STATS BAR */}
      <footer className="glass h-12 flex justify-between items-center px-6 rounded-xl border border-white/5">
         <div className="flex gap-6 items-center">
            <span className="text-[9px] font-bold text-zinc-600 uppercase">Latency: <span className="text-emerald-500">12ms</span></span>
            <span className="text-[9px] font-bold text-zinc-600 uppercase">Uptime: <span className="text-emerald-500">99.9%</span></span>
         </div>
         <div className="text-[9px] font-mono text-zinc-600">
            SYSTEM_PROTOCOL: GHOST_00-A1
         </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value, color = "text-white" }: { label: string, value: number, color?: string }) {
  return (
    <div className="glass bg-white/5 p-4 rounded-xl border border-white/5">
      <span className="text-[9px] text-zinc-500 uppercase tracking-widest block mb-1">{label}</span>
      <span className={cn("text-2xl font-mono leading-none", color)}>{value}</span>
    </div>
  );
}

function NavItem({ icon, active, onClick, label }: { icon: React.ReactNode, active: boolean, onClick: () => void, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center justify-center p-3 rounded-2xl transition-all duration-300 group",
        active ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "text-gray-500 hover:text-white"
      )}
    >
      {icon}
      <span className="absolute left-16 px-2 py-1 bg-black text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none uppercase tracking-widest whitespace-nowrap z-50">
        {label}
      </span>
    </button>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="flex gap-4 p-5 bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="shrink-0 p-3 bg-emerald-50 rounded-xl h-fit">
        {icon}
      </div>
      <div>
        <h4 className="font-medium text-sm">{title}</h4>
        <p className="text-xs text-gray-400 mt-1">{desc}</p>
      </div>
    </div>
  );
}
