# Proposta de Arquitetura RAG — Revisada

## Visão geral

Sistema RAG para suporte interno da NovaTech, permitindo que atendentes consultem a base documental (~1.200 documentos) via linguagem natural, com respostas em segundos e indicação da fonte.

---

## Stack

| Componente | Escolha | Justificativa |
|---|---|---|
| Busca vetorial | Azure AI Search | Já no ambiente Microsoft da NovaTech |
| Embedding | `text-embedding-3-small` | Melhor custo-benefício que ada-002; dimensão configurável |
| LLM | GPT-4.1 | Superior ao GPT-4o; suporta fine-tuning se necessário |
| OCR / extração | Azure Document Intelligence | Pré-processamento de PDFs escaneados antes do embedding |

---

## Indexação

### Índice único com metadados estruturados

Um único índice com os seguintes metadados por chunk:

- `tipo_documento`: `compliance` | `sla` | `frete` | `faq`
- `area`: departamento responsável pelo documento
- `titulo_documento`: nome do arquivo/documento original
- `secao`: título da seção de onde o chunk foi extraído
- `pagina`: número da página (quando aplicável)
- `versao`: versão do documento
- `data_vigencia`: data de início de vigência da versão atual
- `hash_conteudo`: hash do chunk, usado para detectar alterações no pipeline

As queries aplicam filtros por `tipo_documento` e `area` antes do retrieval semântico, evitando ruído entre domínios.

---

## Chunking

- Estratégia: **por unidade semântica** (parágrafo ou seção lógica)
- Limite máximo: ~400 tokens por chunk
- Overlap: 15% entre chunks adjacentes para preservar contexto nas bordas
- Para tabelas e listas estruturadas (ex: tabelas de SLA): manter a linha ou seção como chunk mínimo, mesmo abaixo do limite

---

## Retrieval

- **Top-k = 8** chunks recuperados por query
- **Reranking semântico** via Azure AI Search Semantic Ranker antes de passar ao LLM (descarta os menos relevantes, reduz ruído no contexto)
- Filtros de metadado aplicados antes do retrieval vetorial

---

## Geração

O system prompt instrui o GPT-4.1 a:

1. Basear a resposta apenas nos chunks fornecidos
2. Citar a fonte ao final de cada afirmação relevante no formato `[Título do Doc, Seção X]`
3. Em caso de chunks com informações contraditórias, priorizar o de `data_vigencia` mais recente e sinalizar o conflito ao usuário
4. Quando a resposta não estiver nos chunks, dizer explicitamente que não encontrou a informação

---

## Pipeline de ingestão

- Execução **automática diária** (agendada via Azure Functions ou similar)
- Processamento **incremental**: apenas documentos com `hash_conteudo` alterado desde a última execução são reindexados
- Fluxo por documento:
  1. Extração de texto (Azure Document Intelligence para PDFs escaneados; extração direta para .docx/.xlsx)
  2. Chunking semântico com metadados
  3. Geração de embeddings (`text-embedding-3-small`)
  4. Upsert no índice Azure AI Search
- **Alertas obrigatórios** em caso de falha no pipeline (email/Teams para o responsável técnico)
- Para o médio prazo: avaliar webhook do SharePoint para trigger imediato em alterações críticas

---

## Avaliação

Antes do go-live, definir e executar:

1. **Precisão do retrieval**: conjunto de 50 perguntas-teste com resposta conhecida — medir percentual em que o chunk correto aparece no top-8
2. **Satisfação de resposta**: amostra semanal de 20 queries avaliadas manualmente pelos atendentes (resposta correta / parcialmente correta / incorreta)
3. **Latência**: log de tempo médio de resposta por query (meta: < 10s)

Uma planilha com amostragem semanal é suficiente para o início; automatizar apenas se o volume justificar.

---

## O que foi simplificado intencionalmente

- **Sem múltiplos índices**: metadados + filtros resolvem a separação de domínios com menos complexidade operacional
- **Sem top-k dinâmico**: top-k = 8 com reranker é suficiente e mais simples de operar
- **Sem fine-tuning**: GPT-4.1 base é adequado; fine-tuning só se avaliações mostrarem lacunas específicas
- **Sem webhooks no lançamento**: pipeline diário resolve o problema central (dados desatualizados); webhooks são evolução natural se a necessidade surgir
