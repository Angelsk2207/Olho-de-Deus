# Olho de Deus

Aplicação de prospecção baseada em OSINT público. Uma captura coordena etapas automáticas de coleta, normalização, deduplicação, verificação básica, score de confiança e organização local dos leads.

## Executar

```bash
npm install
npm run dev
```

A fonte padrão é Photon sobre dados OpenStreetMap, sem chave ou configuração externa. O endpoint `GET /health` informa a disponibilidade; `POST /api/capture` recebe `{ "query": "..." }`; a interface usa `GET /api/capture/stream?query=...` para progresso em tempo real.
