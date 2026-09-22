# Olho de Deus

Aplicação de prospecção baseada em OSINT público. Uma captura coordena etapas automáticas de coleta, normalização, deduplicação, verificação básica, score de confiança e organização local dos leads.

## Executar

```bash
npm install
npm run dev
```

A fonte padrão é Photon sobre dados OpenStreetMap, sem chave ou configuração externa. O endpoint `GET /health` informa a disponibilidade; `POST /api/capture` recebe `{ "query": "..." }`; a interface usa `GET /api/capture/stream?query=...` para progresso em tempo real.

## Expansão: CRM + radar de oportunidades

O Olho de Deus evolui de um radar de leads para um CRM de prospecção assistida, com uma camada de análise de aderência baseada na descrição do negócio, localização, segmento, oferta, presença digital e critérios definidos pelo usuário. O sistema deve explicar por que um lead foi classificado como compatível, revisar duplicidades e manter histórico de evidências e contatos.

### Módulos planejados

- **Radar configurável:** busca por segmento, região, palavras-chave, porte e sinais públicos de oportunidade.
- **Perfil de negócio:** consolidação de nome, categoria, canais públicos, localização, site, redes sociais e sinais observáveis.
- **Análise de aderência:** score transparente, critérios editáveis, evidências e nível de confiança; nunca promessas de resultado.
- **CRM:** etapas, status, notas, próximos passos, histórico, origem do lead e exportação.
- **Pesquisa empresarial:** consultas a fontes públicas e oficiais, incluindo registros empresariais disponíveis legalmente, como SINTEGRA quando aplicável.
- **Investigação responsável:** dados de pessoas físicas só podem ser tratados quando forem públicos, necessários, pertinentes ao objetivo comercial e obtidos de forma lícita; CPF não deve ser usado para enriquecimento indiscriminado, exposição ou perfil invasivo.
- **Sinte/Sintegra:** a integração deve ser confirmada antes de ser implementada; o sistema não deve inventar uma fonte nem coletar dados protegidos.

### Automação com controle humano

Agentes especializados podem pesquisar, normalizar, deduplicar, analisar e atualizar o CRM. O envio de mensagens, alterações de dados sensíveis, criação de perfis e ações externas exigem aprovação do usuário. Toda evidência deve ter origem, data de coleta, finalidade e possibilidade de revisão ou exclusão.

A arquitetura prioriza fontes públicas, conformidade com a LGPD, minimização de dados, segurança, trilha de auditoria e separação entre descoberta, análise e contato.

