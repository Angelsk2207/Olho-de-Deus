# Olho de Deus — organograma interativo dos agentes

O componente visual interativo está em `src/components/AgentArchitecture.tsx` e aparece no menu lateral como **Organograma**.

## Arquitetura proposta

```text
Pessoa usuária (texto/voz)
          ↓
Chat do Olho de Deus
          ↓
Agente orquestrador — identifica intenção e seleciona capacidades
          ├── Agente OSINT — fontes públicas, evidências, pesquisa responsável
          ├── Agente de conectores — estado de sessão autorizada em plataformas
          ├── Memória + CRM — persistência isolada por workspace/cliente
          ├── Radar e agenda — acompanhamentos e alertas autorizados
          ├── Agente de cibersegurança — revisão, detecção e recomendações
          └── Agente de manutenção — diagnóstico, testes e proposta de correção
```

## Estado atual — não confundir desenho com implementação

- **Pipeline OSINT:** backend existente em `server.ts`, com escopo e fontes limitados; não equivale a um sistema autônomo completo.
- **Chat:** interface sendo publicada; a integração com um modelo de linguagem e orquestrador ainda precisa ser implementada e validada.
- **Orquestrador, agentes especializados, memória persistente, CRM cloud e conectores:** planejados/em implementação, conforme os componentes forem construídos.
- **Cibersegurança e manutenção:** agentes planejados. A proteção também exige autenticação, validação de entrada, isolamento entre clientes, gestão segura de segredos, testes, logs e revisão humana.

## Regras de segurança

- Nunca solicitar ou armazenar senha de plataforma no Olho de Deus. O login deve acontecer diretamente na página da plataforma em aba separada.
- Não contornar 2FA, CAPTCHA, limites de uso ou termos de serviço.
- Restringir OSINT a dados públicos pertinentes e legítimos, registrar origem e data e indicar incerteza.
- Pedir aprovação antes de envio, publicação, contato externo, alteração de dados ou ação irreversível.
- Separar dados de cada cliente e permitir controle e exclusão de seus registros conforme a política do produto.
- Mudanças sugeridas pelo agente de manutenção devem passar por testes e aprovação antes de produção.
- Não prometer segurança absoluta: agentes ajudam a detectar e responder, mas não substituem controles técnicos e revisão contínua.

## Roteiro de implementação

1. Chat responsivo e navegação (interface).
2. API de conversa autenticada e orquestrador com agentes registrados.
3. Memória/CRM em nuvem isolados por cliente e com retenção controlada.
4. Integrações permitidas com status de conexão; login externo isolado.
5. Radar, agendamentos e notificações com aprovação por tipo de ação.
6. Testes automatizados, revisão de segurança e publicação por etapas.
