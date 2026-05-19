/**
 * Olho que Tudo Vê - Agente Extrator de HTML (Dorks)
 * 
 * Este script deve ser colado no Editor de Scripts (Extensions > Apps Script)
 * do seu Google Sheets. Ele analisa resultados de busca e extrai leads.
 */

const CONFIG = {
  SEARCH_QUERY: 'site:instagram.com "arquitetura" "31" "@gmail.com"',
  LEAD_STATUS_PENDING: "PENDENTE",
  SHEET_NAME: "Sheet1"
};

/**
 * Função principal para executar a varredura
 */
function runLeadScraper() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow(["Timestamp", "Empresa", "Endereço", "NanoData", "Status"]);
  }

  const query = CONFIG.SEARCH_QUERY;
  const results = searchGoogle(query);
  
  results.forEach(result => {
    const leads = extractLeadsFromText(result.snippet + " " + result.title);
    
    leads.emails.forEach(email => {
      // Formato Nano-Compactado: Nome|Telefone|Email|Site|Rating
      const phone = leads.phones[0] || "SEM_TEL";
      const nanoData = `${result.title}|${phone}|${email}|${result.link}|0`;
      
      sheet.appendRow([
        new Date(),
        result.title,
        result.link,
        nanoData,
        CONFIG.LEAD_STATUS_PENDING
      ]);
    });
  });
  
  SpreadsheetApp.getUi().alert("Varredura concluída. Leads inseridos na planilha.");
}

/**
 * Simula busca via Google Custom Search ou UrlFetchApp (limitado)
 * Nota: Para resultados reais, recomenda-se usar a Google Custom Search API.
 */
function searchGoogle(query) {
  // Nota: UrlFetchApp para google.com/search pode ser bloqueado por CAPTCHA.
  // Este é um exemplo de como processar os dados se você tiver um HTML ou usar API.
  const url = "https://www.googleapis.com/customsearch/v1?key=YOUR_API_KEY&cx=YOUR_CX&q=" + encodeURIComponent(query);
  
  // Como estamos no sandbox, vamos simular o retorno para o usuário poder copiar a lógica
  return [
    { title: "Arquiteto Design BH", link: "https://instagram.com/arqbh", snippet: "Contato: arq@gmail.com | (31) 98877-6655" },
    { title: "Studio Luxo Interiores", link: "https://instagram.com/studioluxo", snippet: "Agende sua consultoria: contato@studioluxo.com.br" }
  ];
}

/**
 * Extrai emails e telefones de um bloco de texto com regex robusta
 */
function extractLeadsFromText(text) {
  // Regex robusta para capturar emails em diversos formatos
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  
  // Regex para telefones (formato brasileiro comum)
  const phoneRegex = /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}/g;
  
  const emails = text ? (text.match(emailRegex) || []) : [];
  const phones = text ? (text.match(phoneRegex) || []) : [];
  
  return {
    emails: [...new Set(emails)], // Remove duplicatas
    phones: [...new Set(phones)]  // Remove duplicatas
  };
}

/**
 * Cria o menu no Google Sheets
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('👁️ Olho que Tudo Vê')
    .addItem('🚀 Iniciar Varredura Dork', 'runLeadScraper')
    .addToUi();
}
