## Anteriormente
Ver [cenario 1](../cenario-1/cenario.md).

## Cenario 2

O projeto NovaTech foi aprovado. O discovery está concluído e a fase de entendimento produziu artefatos concretos: ADRs com decisões arquiteturais (modelo LLM, estratégia de contexto, tratamento de documentos contraditórios, build vs buy), uma spec de requisitos de produto para o pipeline de RAG, um protótipo funcional de RAG com ferramentas open-source, cenários de falha mapeados pelo QA, e um plano de testes inicial. Agora o time precisa estruturar o ambiente, os padrões e os artefatos que vão governar o desenvolvimento.

### O que foi definido na fase anterior (cenário 1)

- **Modelo LLM:** Azure OpenAI (GPT-4o) — escolhido pela integração com o ecossistema Microsoft da NovaTech e pela janela de 128K tokens (ADR-0001).
- **Pipeline de RAG:** Azure AI Search + Azure OpenAI. O protótipo open-source (ChromaDB + sentence-transformers) validou a abordagem e identificou problemas de chunking em tabelas (ADR-0004).
- **Estratégia de contexto:** Context budget de ~4K tokens para system prompt + ~8K para chunks (5 chunks de ~1.500 tokens) + pergunta + histórico limitado a 3 turnos (ADR-0002).
- **Documentos contraditórios:** Metadado de vigência no pipeline; prompt instrui o modelo a priorizar versão mais recente; documentos obsoletos marcados, não excluídos (ADR-0003).
- **Integração:** Microsoft Teams (bot) + painel web interno.
- **Base documental:** das ~1.250 fontes brutas do cenário 1 (SharePoint, Confluence e planilhas), após deduplicação e limpeza no discovery restaram 847 documentos válidos consolidados (12 deles com contradições pendentes de resolução pelo Compliance da NovaTech); 63 foram descartados por obsolescência e ~340 eliminados como duplicatas ou redundâncias.
- **Arquitetura:** 4 componentes — (1) pipeline de ingestão, (2) API do assistente (Azure Functions + Azure AI Search + Azure OpenAI), (3) interface no Teams via Bot Framework, e (4) painel web interno (dashboard de métricas e histórico).
- **Stack:** TypeScript (backend e bot), React (painel web), Bicep para infraestrutura como código.
- **Repositório:** `novatech-assistant` (o prefixo `db1/` é narrativo). Nesta fase é trabalhado como repositório Git **local** — ver Anexo D (Starter Repo); não há remoto nem GitHub necessários.
- **Time:** 1 Tech Lead, 2 Desenvolvedores (1 pleno, 1 sênior), 1 QA, 1 Product Specialist, 1 Delivery Manager.


### O desafio desta fase

Antes de escrever a primeira linha de código de produção, o time precisa:
1. Definir como agentes de IA (Copilot, Claude Code) serão usados no desenvolvimento — regras, limites, padrões.
2. Recortar o domínio do projeto (bounded contexts, linguagem ubíqua) e especificar o que será construído usando Spec Driven Development.
3. Configurar as conexões que os agentes precisam para operar (MCP servers para acessar repositório, docs, Azure).
4. Criar skills reutilizáveis que encapsulam os padrões do projeto para geração consistente de código e artefatos.
