import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
// Render and other cloud hosts provide PORT dynamically.
const PORT = Number(process.env.PORT) || 3000;

// Middleware
app.use(express.json({ limit: "2mb" }));

// Lightweight health endpoint for deployment monitoring.
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "olho-que-tudo-ve",
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    mapsConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY),
  });
});

// Gemini Initialization
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// APIs
app.post("/api/gemini/generate", async (req, res) => {
  try {
    const { prompt, systemInstruction } = req.body;
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ error: "GEMINI_API_KEY is not configured" });
    }
    
    const response = await ai.models.generateContent({ 
      model: "gemini-1.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
      },
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini error:", error);
    let details = error.message;
    const errorStr = JSON.stringify(error);
    if (error.status === 429 || errorStr.includes("429") || error.message?.includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED")) {
      details = "LIMITE DE COTAS (QUOTA) ATINGIDO no Gemini. Aguarde alguns minutos ou mude seu plano.";
    }
    res.status(500).json({ error: "Erro de IA", details: details });
  }
});

app.post("/api/phantom/search", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Query is required" });
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ error: "GEMINI_API_KEY is not configured" });
    }

    console.log(`[PHANTOM] Starting AI Search for: ${query}`);

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: `Encontre 10 leads de empresas para a pesquisa: "${query}". 
      Extraia o máximo de detalhes possível (Nome, Telefone, Site, Endereço).
      
      Retorne APENAS um JSON Array de objetos:
      [{ "name": "...", "phone": "...", "email": "...", "site": "...", "rating": 5, "address": "..." }]`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "[]";
    const leads = JSON.parse(text);
    res.json(leads);
  } catch (error: any) {
    console.error("[PHANTOM ERROR]:", error);
    
    let details = error.message;
    const errorStr = JSON.stringify(error);
    if (error.status === 429 || errorStr.includes("429") || error.message?.includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED")) {
      details = "LIMITE DE COTAS (QUOTA) ATINGIDO no Gemini. Aguarde alguns minutos ou mude seu plano na conta Google AI Studio.";
    }

    res.status(500).json({ 
      error: "Erro na Navegação Fantasma", 
      details: details 
    });
  }
});

app.post("/api/dork/extract", async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: "Content is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ error: "GEMINI_API_KEY is not configured" });
    }

    const response = await ai.models.generateContent({ 
      model: "gemini-1.5-flash",
      contents: `Extraia os leads deste conteúdo:\n\n${content.substring(0, 50000)}`,
      config: {
        systemInstruction: `Você é um extrator de leads de alta precisão.
Analise o conteúdo HTML ou Texto de uma página de resultados do Google (obtido via Dork).
Extraia: Nome da Empresa, Telefone, Email, Site.
A classificação (rating) deve ser estimada com base no contexto ou 0 se não houver.

Retorne APENAS um JSON Array de objetos:
[{ "name": "...", "phone": "...", "email": "...", "site": "...", "rating": 0, "address": "..." }]
Remova marcas de formatação de markdown.`,
      }
    });

    const text = response.text || "[]";
    
    // Clean JSON response (sometimes Gemini adds ```json ... ```)
    const jsonMatch = text.match(/\[.*\]/s);
    const cleanJson = jsonMatch ? jsonMatch[0] : text;
    
    const extractedLeads = JSON.parse(cleanJson);
    res.json(extractedLeads);
  } catch (error: any) {
    console.error("Dork Extract error:", error);
    let details = error.message;
    const errorStr = JSON.stringify(error);
    if (error.status === 429 || errorStr.includes("429") || error.message?.includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED")) {
      details = "LIMITE DE COTAS (QUOTA) ATINGIDO no Gemini. Aguarde alguns minutos.";
    }
    res.status(500).json({ error: "Erro na Extração Dork", details: details });
  }
});

// Proxy Google Places API
app.get("/api/maps/search", async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: "Search query is required" });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: "Pesquisa de mapas indisponível",
        details: "Configure GOOGLE_MAPS_API_KEY no servidor para ativar esta fonte.",
      });
    }

    console.log(`[MAPS] Searching (New API) for: ${query}`);
    
    const response = await axios.post(
      `https://places.googleapis.com/v1/places:searchText`,
      { textQuery: query as string, languageCode: 'pt-BR' },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating'
        }
      }
    );

    const places = response.data.places || [];
    console.log(`[MAPS] Found ${places.length} results`);
    
    // Map to legacy format for frontend compatibility
    const results = places.map((p: any) => ({
      place_id: p.id,
      name: p.displayName?.text,
      formatted_address: p.formattedAddress,
      rating: p.rating
    }));
    
    res.json(results);
  } catch (error: any) {
    const errorData = error.response?.data;
    console.error("[MAPS SEARCH ERROR]:", JSON.stringify(errorData || error.message, null, 2));
    
    // Extract a more useful message if it's a Google RPC error
    let details = error.message;
    if (errorData?.error) {
      details = errorData.error.message || JSON.stringify(errorData.error);
      if (JSON.stringify(errorData).includes("SERVICE_DISABLED")) {
        details = "A 'Places API (New)' não está ativada no seu console Google Cloud. Ative-a para continuar.";
      } else if (JSON.stringify(errorData).includes("API_KEY_INVALID")) {
        details = "A sua GOOGLE_MAPS_API_KEY é inválida ou expirou.";
      }
    }

    res.status(500).json({ 
      error: "Erro na Pesquisa de Mapas", 
      details: details 
    });
  }
});

app.get("/api/maps/details", async (req, res) => {
  try {
    const { placeId } = req.query;
    if (!placeId) {
      return res.status(400).json({ error: "placeId is required" });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: "Detalhes de mapas indisponíveis",
        details: "Configure GOOGLE_MAPS_API_KEY no servidor para ativar esta fonte.",
      });
    }

    console.log(`[MAPS] Fetching Details for: ${placeId}`);
    
    const response = await axios.get(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,rating'
        }
      }
    );

    const p = response.data;
    // Map to legacy format for frontend compatibility
    const result = {
      name: p.displayName?.text,
      formatted_phone_number: p.nationalPhoneNumber || p.internationalPhoneNumber || "Não Encontrado",
      website: p.websiteUri || "Não Encontrado",
      formatted_address: p.formattedAddress,
      rating: p.rating
    };

    res.json(result);
  } catch (error: any) {
    const errorData = error.response?.data;
    console.error("[MAPS DETAILS ERROR]:", JSON.stringify(errorData || error.message, null, 2));

    let details = error.message;
    if (errorData?.error) {
      details = errorData.error.message || JSON.stringify(errorData.error);
      if (JSON.stringify(errorData).includes("SERVICE_DISABLED")) {
        details = "A 'Places API (New)' não está ativada no seu console Google Cloud.";
      }
    }

    res.status(500).json({ 
      error: "Erro nos Detalhes do Lead", 
      details: details
    });
  }
});

// Vite middleware for development
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

setupVite();
