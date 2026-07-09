# AGENTS.md — NovaTech Assistant


## Project Overview

NovaTech Assistant é um assistente de suporte ao cliente baseado em RAG (Retrieval-Augmented Generation) para a NovaTech Logística. O sistema responde perguntas sobre políticas de devolução, SLAs de entrega, fretes especiais e procedimentos internos, consultando documentos oficiais indexados antes de gerar qualquer resposta.

**Objetivos não-negociáveis:**
- Nunca inventar informações — toda resposta deve ser apoiada por chunks recuperados.
- Detectar e apresentar documentos contraditórios de forma determinística (ver ADR-0003).
- Respeitar o orçamento de tokens definido na ADR-0002 sem exceções.

**Canais de acesso:** Microsoft Teams (bot com Adaptive Cards) e painel web React.


## Tech Stack & Architecture

### Stack

| Camada | Tecnologia | Decisão |
|--------|-----------|---------|
| Linguagem | TypeScript 5.5, strict mode | — |
| Runtime | Azure Functions v4 (Node.js) | — |
| LLM | Azure OpenAI GPT-4o (128k tokens) | ADR-0001 |
| Vector store + ranker | Azure AI Search S1 | ADR-0004 |
| OCR | Azure Document Intelligence | ADR-0004 |
| Indexação de docs | SharePoint Online Indexer (nativo) | ADR-0004 |
| Bot | Microsoft Teams / Bot Framework | — |
| Frontend | React + TypeScript | — |
| Validação em runtime | Zod 3.23 | — |
| Testes | Vitest 2.0 | — |
| IaC | Bicep (Azure) | — |

### Arquitetura de componentes

```
Usuário (Teams / Web)
    ↓
Azure Functions — query handler
    ↓
SearchService  →  Azure AI Search (semantic ranker)
    ↓
PromptBuilder  (monta contexto — regras ADR-0002)
    ↓
CompletionService  →  Azure OpenAI GPT-4o
    ↓
ResponseValidator  (citações, contradições — ADR-0003)
    ↓
Resposta formatada (Adaptive Card / JSON)
```

Fluxo de ingestão paralelo:
```
SharePoint Online
    ↓ (native indexer)
Azure Document Intelligence (OCR)
    ↓
Azure AI Search — index vetorial
```

### Regras de gerenciamento de contexto (ADR-0002)

Estas regras **não são sugestões** — o `PromptBuilder` deve implementá-las exatamente.

#### Orçamento fixo de tokens por chamada

| Slot | Tokens | Responsável no código |
|------|--------|-----------------------|
| System prompt | 1 200 | `prompts/system-prompt.md` |
| Histórico de conversa | 800 | `PromptBuilder.buildHistory()` |
| Chunks recuperados | 3 500 | `PromptBuilder.buildContext()` |
| Pergunta do usuário | 300 | `PromptBuilder.buildQuery()` |
| Margem de segurança | 200 | reservada, não usável |
| **Total** | **6 000** | `PromptBuilder.validate()` |

Se o total ultrapassar 6 000 tokens, `PromptBuilder.validate()` deve lançar erro antes de chamar a API.

#### Recuperação de chunks

- Recuperar **top 5 chunks** por relevância semântica.
- Cada chunk deve ter **400–600 tokens**; rejeitar chunks fora desse intervalo durante a ingestão.
- **Score mínimo do semantic ranker: 3,0 / 4,0.** Chunks abaixo desse limiar não entram no contexto.
- Se menos de 2 chunks atingirem o limiar, a função deve retornar recusa padronizada em vez de tentar responder.

> O limiar 3,0 precisa de validação empírica nas primeiras 2 semanas de homologação com ≥ 50 queries representativas. Registrar resultados em `docs/runbooks/`.

#### Consultas multi-domínio

1. Classificador de domínio detecta se a pergunta abrange mais de um domínio (devolução, SLA, frete, etc.).
2. Uma sub-query é executada por domínio identificado.
3. Os resultados são re-rankeados globalmente com **restrição de diversidade: ≥ 1 chunk por domínio identificado**, respeitando ainda o limite de 5 chunks e 3 500 tokens totais.

#### Histórico de conversa (sliding window com compressão)

- Manter: turno atual + turno anterior **comprimido** (máx. 150 tokens).
- Descartar: T-2 e mais antigos.
- A compressão do turno anterior é responsabilidade do `PromptBuilder`; não delegar ao LLM em tempo real.

#### Gatilhos de revisão da ADR-0002

Se qualquer condição abaixo ocorrer, abrir issue e revisar a estratégia antes de continuar:
- Taxa de falha em queries multi-domínio > 15 %
- Custos > 2× estimativa mensal
- Troca de modelo (requer recalibração do limiar)

## Coding Standards

### Encoding e idioma (pt-BR)

Todo arquivo do projeto deve ser salvo em **UTF-8**. Isso não é opcional: o locale do produto é pt-BR e qualquer texto legível por humanos — logs, mensagens de erro, mensagens de commit, respostas geradas por prompt, conteúdo de Adaptive Cards — usa acentuação e caracteres especiais do português (ex.: "não", "política", "devolução"). Encoding incorreto corrompe esse texto silenciosamente.

- Todo texto voltado a humanos (mensagens de erro, logs, respostas de prompt, UI) deve ser escrito em português correto — com acentuação, concordância e ortografia adequadas. Não abreviar ou remover acentos para "simplificar".
- Arquivos de código-fonte, configuração e documentação devem ser salvos em UTF-8 sem BOM.
- Ao gerar strings de erro ou log a partir de templates, verificar que caracteres acentuados não sejam escapados ou substituídos incorretamente (ex.: `?` no lugar de `ã`, `ç`, `é`).

### Reuso de estruturas em `shared/`

Antes de escrever um tipo, schema, classe de erro, value object ou utilitário novo, verificar se algo equivalente já existe em `shared/` (`types.ts`, `errors.ts`, `config.ts`, `logger.ts`). Ao gerar código novo, avalie se ele tem potencial de reuso por outras partes do sistema (outra Function, outro service, outra etapa do pipeline) — se sim, ele deve nascer em `shared/`, não duplicado localmente.

- Duplicar um schema Zod, um branded type ou uma classe de erro em vez de importar de `shared/` cria divergência silenciosa entre módulos que deveriam concordar sobre o mesmo formato de dado.
- Se, ao implementar uma feature, você perceber que um tipo/utilitário que está criando também seria útil em `services/` ou `pipeline/`, mova-o para `shared/` imediatamente — não espere uma segunda ocorrência para refatorar.
- Regra de dependência (`functions → services → shared`, `pipeline → shared`) continua valendo: `shared/` nunca importa de `services/`, `pipeline/` ou `functions/`.

### Estrutura de arquivos

```
src/
  functions/<nome>/handler.ts   # Azure Function HTTP trigger
  services/<nome>.ts            # lógica de negócio
  pipeline/<etapa>.ts           # extractor | chunker | embedder | indexer
  shared/
    config.ts                   # variáveis de ambiente (sem defaults inseguros)
    errors.ts                   # classes de erro tipadas
    types.ts                    # tipos Zod + TypeScript
    logger.ts                   # logger estruturado
```

Nunca importar de `services/` dentro de `pipeline/` e vice-versa. Dependências só fluem para baixo: `functions → services → shared`, `pipeline → shared`.

### TypeScript

#### `strict: true` é inegociável

O compilador está configurado com `"strict": true` em `tsconfig.json`. Isso ativa checagens que eliminam classes inteiras de bug em runtime: `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, entre outras. **Nunca use `// @ts-ignore` ou `// @ts-expect-error` sem um comentário explicando o bug externo que o forçou.**

```typescript
// Errado — any desliga toda verificação naquele caminho
function buildPrompt(context: any): string { ... }

// Correto — o compilador verifica que todos os campos existem
function buildPrompt(context: RetrievalContext): string { ... }
```

#### Tipos de entrada/saída via `z.infer`

O schema Zod **é** o tipo — não duplique. Derive o tipo TypeScript a partir do schema, nunca o contrário.

```typescript
// shared/types.ts
export const QueryInputSchema = z.object({
  question: z.string().min(1).max(1000),
  conversationId: ConversationId, // value object — ver seção abaixo
  domainHints: z.array(z.string()).optional(),
});
export type QueryInput = z.infer<typeof QueryInputSchema>;

// handler.ts — usa o tipo derivado, não redefine
import { QueryInput } from "../shared/types";
async function handler(input: QueryInput): Promise<QueryOutput> { ... }
```

Se o schema mudar, o tipo muda automaticamente. O inverso não acontece com interfaces manuais.

#### `unknown` em catch blocks

`catch (e)` captura qualquer valor — não necessariamente um `Error`. Tratar como `unknown` força a inspeção antes de usar.

```typescript
// Errado — e.message pode explodir se e não for Error
try { ... } catch (e: any) {
  logger.error(e.message);
}

// Correto
try { ... } catch (e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  logger.error({ err: message, context });
}
```

#### Exportar apenas o necessário

Cada módulo expõe uma superfície mínima. Exportações desnecessárias criam acoplamento invisível — qualquer módulo pode começar a depender de um detalhe interno, dificultando refatorações.

```typescript
// Errado — expõe internals
export function tokenizeChunk(...) { ... }     // usado apenas aqui
export function scoreChunk(...) { ... }        // usado apenas aqui
export function rankChunks(...) { ... }        // a única função que os outros precisam

// Correto
function tokenizeChunk(...) { ... }
function scoreChunk(...) { ... }
export function rankChunks(...) { ... }
```

### Validação com Zod

#### Validar na borda, confiar internamente

Validação Zod acontece **uma vez**: na entrada de Azure Functions (dados do usuário) e na saída de APIs externas (Azure AI Search, Azure OpenAI). Dentro do sistema, confie nos tipos — não revalide o que o compilador já garante.

```typescript
// functions/query/handler.ts — borda de entrada
const input = QueryInputSchema.parse(req.body); // lança ZodError se inválido
await queryService.execute(input);              // passa QueryInput já validado

// services/query.ts — interior do sistema
async execute(input: QueryInput): Promise<QueryOutput> {
  // NÃO repita: z.string().parse(input.question)
  // O tipo QueryInput já garante que question é string não-vazia
  const chunks = await this.search.retrieve(input.question);
  ...
}
```

**Motivação:** revalidação interna é ruído que mascara onde a validação real acontece. Quando há um bug de validação, o dev procura em múltiplos lugares. Com validação apenas na borda, o caminho é direto.

#### Prefira `.parse()` a `.safeParse()` na borda

`.parse()` lança `ZodError` estruturado, que o handler de erro global converte em HTTP 400 com detalhes. `.safeParse()` é para casos onde a falha é esperada e você precisa inspecionar o resultado antes de decidir o que fazer.

```typescript
// Na borda de entrada — deixe o ZodError propagar para o handler global
const body = QueryInputSchema.parse(req.body);

// Quando a falha é um caso de negócio legítimo — ex.: chunk opcional
const result = ChunkSchema.safeParse(rawChunk);
if (!result.success) {
  logger.warn({ reason: result.error.flatten() });
  return null; // chunk ignorado, fluxo continua
}
```

#### Schemas em `shared/types.ts`, nunca inline

Definir um schema inline numa função impede reuso em testes, impossibilita exportar o tipo derivado e torna difícil encontrar onde a estrutura está definida.

```typescript
// Errado — schema perdido dentro de uma função
async function handleFeedback(req: HttpRequest) {
  const body = z.object({ rating: z.number().min(1).max(5) }).parse(req.body);
  ...
}

// Correto — schema nomeado, tipo exportado, testável isoladamente
// shared/types.ts
export const FeedbackInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
  queryId: QueryId, // value object tipado
});
export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;
```

### Value Objects e Primitive Obsession

#### O problema

`string` é um tipo válido para um CNPJ, um ID de query, um ID de chunk e um domínio de classificação — mas esses valores **não são intercambiáveis**. Passar o ID errado no lugar certo é um bug silencioso que o compilador não detecta se tudo for `string`.

```typescript
// Perigoso — o compilador aceita, o sistema quebra em runtime
function retrieveChunks(queryId: string, chunkId: string) { ... }
retrieveChunks(chunk.id, query.id); // argumentos invertidos — sem erro de compilação
```

#### A solução: branded types + guards

Use um wrapper mínimo com uma "marca" que torna o tipo incompatível com outros `string`, mesmo sem criar uma classe.

```typescript
// shared/types.ts

// Branded type — string com marca nominal
type Brand<T, B> = T & { readonly _brand: B };

export type QueryId      = Brand<string, "QueryId">;
export type ChunkId      = Brand<string, "ChunkId">;
export type ConversationId = Brand<string, "ConversationId">;

// Funções construtoras com validação embutida
export function QueryId(raw: string): QueryId {
  if (!raw || raw.trim().length === 0) throw new Error("QueryId inválido");
  return raw as QueryId;
}

export function ChunkId(raw: string): ChunkId {
  if (!raw || raw.trim().length === 0) throw new Error("ChunkId inválido");
  return raw as ChunkId;
}
```

Agora o compilador rejeita a troca acidental:

```typescript
function retrieveChunks(queryId: QueryId, chunkId: ChunkId) { ... }

retrieveChunks(chunk.id, query.id);
// TS2345: Argument of type 'ChunkId' is not assignable to parameter of type 'QueryId'
```

#### Quando usar value objects

| Situação | Usar value object? | Exemplo |
|----------|--------------------|---------|
| ID de entidade distinta | **Sim** | `QueryId`, `ChunkId`, `ConversationId` |
| Valor com regra de formato | **Sim** | `SemanticScore` (0–4), email, CNPJ |
| Valor trocável entre contextos | Não | `string` genérico, `number` sem restrição |

#### Schemas Zod com branded types

Integre os value objects diretamente nos schemas para que a validação na borda também produza o tipo correto:

```typescript
// shared/types.ts
export const QueryIdSchema = z.string().min(1).transform(QueryId);
export const SemanticScoreSchema = z.number().min(0).max(4)
  .transform(n => n as Brand<number, "SemanticScore">);

export const RetrievedChunkSchema = z.object({
  id:    ChunkIdSchema,
  score: SemanticScoreSchema,
  text:  z.string(),
  source: z.string(),
});
export type RetrievedChunk = z.infer<typeof RetrievedChunkSchema>;
```

Após o `.parse()` na borda, `chunk.id` já é `ChunkId` — sem cast manual em nenhum outro lugar.

#### Guards de tipo para verificação em runtime

Quando um valor chega de fora do sistema (ex.: campo de banco, resposta de API) e precisa ser verificado antes de ser elevado ao tipo branded:

```typescript
export function isValidSemanticScore(n: number): n is Brand<number, "SemanticScore"> {
  return Number.isFinite(n) && n >= 0 && n <= 4;
}

// uso
if (!isValidSemanticScore(rawScore)) {
  throw new RetrievalThresholdError(`Score inválido: ${rawScore}`);
}
const score = rawScore as Brand<number, "SemanticScore">;
```

### Azure Functions v4

Todo endpoint Azure **deve** ser implementado com a lib oficial do Azure Functions v4, pacote `@azure/functions` — nunca outro framework HTTP (Express, Fastify, etc.) por baixo ou por cima dela, e nunca o modelo v3 (`function.json` + decorators de classe). Toda Function HTTP segue o modelo de registro programático do Azure Functions v4.

```typescript
// functions/query/handler.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { QueryInputSchema } from "../../shared/types";
import { queryService } from "../../services/query";

async function queryHandler(
  req: HttpRequest,
  ctx: InvocationContext
): Promise<HttpResponseInit> {
  const input = QueryInputSchema.parse(await req.json());
  const result = await queryService.execute(input, ctx);
  return { status: 200, jsonBody: result };
}

app.http("query", {
  methods: ["POST"],
  authLevel: "function",
  handler: queryHandler,
});
```

Regras:
- Um arquivo por Function; o nome do arquivo reflete o nome do trigger registrado em `app.http(...)`.
- `authLevel: "function"` em todos os endpoints — nunca `"anonymous"` em produção.
- Erros não tratados dentro do handler devem ser capturados pelo middleware de erro do próprio handler e retornar `{ status: 400 | 500, jsonBody: { error: ... } }` — nunca deixar a Function quebrar sem resposta estruturada.
- `InvocationContext` é passado para serviços que precisam logar com correlation ID do Azure.

### Logging com pino

**Nunca use `console.log`, `console.warn` ou `console.error`** em nenhum arquivo do projeto. O `console` não produz JSON estruturado e não inclui campos obrigatórios de correlação. Todo log passa por `shared/logger.ts`.

Aplicar logging estruturado com `pino` de forma generosa é incentivado, não apenas tolerado — especialmente em torno de **chamadas de endpoint** (Azure Functions HTTP triggers, chamadas ao Azure OpenAI, ao Azure AI Search, a qualquer serviço externo). Cada chamada de endpoint deve logar no mínimo entrada e saída (ou erro), com os IDs de correlação relevantes (`queryId`, `conversationId`), para permitir reconstruir o fluxo completo de uma requisição a partir dos logs. Prefira logar demais em pontos de I/O externo a logar de menos — rastreabilidade em produção depende disso.

```typescript
// shared/logger.ts
import pino from "pino";
export const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
```

```typescript
// Errado — não rastreável, não filtrável por campo
console.log("recuperando chunks para query", queryId);
console.error("falha na busca", err);

// Correto — structured log com campos indexáveis
import { logger } from "../shared/logger";

logger.info({ queryId, domain }, "recuperando chunks");
logger.error({ err, queryId, chunkCount: 0 }, "falha na busca semântica");
```

#### Campos obrigatórios por nível

| Nível | Quando usar | Campos mínimos |
|-------|-------------|----------------|
| `logger.info` | fluxo normal de operação | `{ queryId }` + mensagem descritiva |
| `logger.warn` | condição degradada mas recuperável | `{ queryId, reason }` |
| `logger.error` | falha que interrompeu o fluxo | `{ err, queryId, context }` |
| `logger.debug` | diagnóstico interno (desabilitado em prod) | livre |

`err` deve sempre ser o objeto `Error` completo — pino serializa `message` e `stack` automaticamente. Não passe `err.message` como string.

```typescript
// Errado — perde o stack trace
logger.error({ err: e.message }, "falha");

// Correto — pino serializa o Error completo
logger.error({ err: e, queryId }, "falha ao chamar Azure OpenAI");
```

### Erros

- Usar classes de erro tipadas definidas em `shared/errors.ts` (ex.: `RetrievalThresholdError`, `TokenBudgetExceededError`).
- Chamar `logger.error({ err, context })` antes de propagar — nunca propagar silenciosamente.
- Nunca expor stack traces para o usuário final; o handler da Function traduz erros internos para mensagens genéricas.

### Vitest

Toda lógica testável vive em `src/` e é coberta por testes em `tests/`. O runner é Vitest — não Jest, não Mocha.

```typescript
// tests/unit/services/search.test.ts
import { describe, it, expect, vi } from "vitest";
import { SearchService } from "../../../src/services/search";

describe("SearchService.retrieve", () => {
  it("descarta chunks abaixo do limiar 3.0", async () => {
    const mockIndex = { search: vi.fn().mockResolvedValue([
      { id: "c1", score: 2.8, text: "..." },
      { id: "c2", score: 3.2, text: "..." },
    ]) };
    const svc = new SearchService(mockIndex as any);
    const result = await svc.retrieve("qual o prazo de devolução?");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c2");
  });
});
```

Regras:
- `vi.fn()` e `vi.mock()` para dependências externas (Azure AI Search, Azure OpenAI); nunca mockar código interno do projeto.
- Testes unitários não fazem I/O — qualquer chamada de rede real pertence a `tests/integration/`.
- Nome do arquivo espelha o path do módulo testado: `src/services/search.ts` → `tests/unit/services/search.test.ts`.
- `describe` descreve o módulo/função; `it` descreve o comportamento esperado em linguagem de domínio, não de implementação.

### Comentários

Escrever comentários apenas quando o **porquê** não é óbvio — restrição de negócio, invariante sutil, workaround de bug específico. Não documentar o que o código já diz.

### Conventional Commits

Todo commit segue o formato:

```
<type>(<scope>): <descrição imperativa em português>

[corpo opcional — explica o porquê, não o quê]
[BREAKING CHANGE: ... se aplicável]
```

**Types válidos:**

| Type | Quando usar |
|------|-------------|
| `feat` | nova funcionalidade visível externamente |
| `fix` | correção de bug |
| `test` | adição ou correção de testes |
| `refactor` | mudança interna sem alterar comportamento externo |
| `docs` | documentação, ADRs, runbooks |
| `chore` | configuração, dependências, build |
| `perf` | melhoria de performance sem mudança de comportamento |

**Scopes válidos:** `query`, `search`, `completion`, `prompt`, `pipeline`, `bot`, `web`, `infra`, `shared`.

```bash
# Correto
git commit -m "feat(query): implementa recusa quando menos de 2 chunks atingem o limiar"
git commit -m "fix(prompt): corrige contagem de tokens do histórico comprimido"
git commit -m "test(search): adiciona cobertura para consultas multi-domínio"
git commit -m "docs(adr): registra decisão de calibração do threshold semântico"

# Errado — vago, sem tipo, sem escopo
git commit -m "ajustes"
git commit -m "fix bug"
git commit -m "wip"
```

A descrição usa verbo no imperativo ("implementa", "corrige", "adiciona") — não particípio ("implementado", "corrigido").

### Branch Strategy

#### Modelo: feature branches locais

Nesta fase do projeto não há repositório remoto. O fluxo de trabalho simula o processo de PR sem push:

```
main  ──────────────────────────────────────────────►
         \                          /
          feat/query-handler ───────
```

1. **Criar a branch** a partir de `main`:
   ```bash
   git checkout -b feat/query-handler
   ```

2. **Nomenclatura obrigatória:** `<type>/<descricao-kebab-case>` onde `type` segue os mesmos valores do Conventional Commits.
   ```
   feat/query-handler
   fix/token-budget-overflow
   test/multi-domain-retrieval
   refactor/prompt-builder-split
   docs/adr-0005-logging
   ```

3. **Commits na branch** seguem Conventional Commits normalmente.

4. **"Abrir PR"** significa criar um arquivo `docs/pull-requests/PR-NNNN.md` com a descrição completa antes de simular o merge.

#### Formato obrigatório do arquivo de PR

```markdown
# PR-NNNN — <título da mudança>

**Branch:** `feat/nome-da-branch`
**Base:** `main`
**Autor:** <nome>
**Data:** YYYY-MM-DD

## Objetivo

<1–3 frases explicando o porquê desta mudança — problema que resolve ou feature que entrega.>

## Mudanças

- `src/services/search.ts`: <o que mudou e por quê>
- `src/shared/types.ts`: <o que mudou e por quê>
- `tests/unit/services/search.test.ts`: <cobertura adicionada>

## Validation Gates

- [ ] `npm run lint` passa sem erros
- [ ] `npm test` passa com cobertura ≥ 80 %
- [ ] `npm run build` compila sem erros
- [ ] Regras da ADR-0002 respeitadas (orçamento de tokens, limiar, multi-domínio)
- [ ] Nenhum `console.log` introduzido
- [ ] Nenhum `any` introduzido sem comentário justificando
- [ ] Sem chaves ou secrets hardcoded

## Notas para o revisor

<Contexto que ajuda quem revisa: decisões de design não óbvias, trade-offs aceitos, o que ficou de fora do escopo.>
```

5. **Simular merge:** após o arquivo de PR estar completo e os validation gates conferidos manualmente, fazer merge na `main`:
   ```bash
   git checkout main
   git merge --no-ff feat/nome-da-branch -m "feat(scope): descrição (closes PR-NNNN)"
   ```
   O `--no-ff` preserva o histórico da branch no log.

#### Proibições de branch

- Nunca commitar diretamente em `main` (exceto `chore: initial setup`).
- Nunca nomear branch com `wip/`, `temp/` ou sem escopo claro.
- Nunca deletar a branch antes de o arquivo `PR-NNNN.md` estar commitado em `main`.

### Proibições gerais

- Não hardcodar chaves, endpoints ou thresholds — usar `shared/config.ts` lendo de variáveis de ambiente.
- Não chamar Azure OpenAI API diretamente em Functions — passar pelo `CompletionService`.
- Não modificar o orçamento de tokens da ADR-0002 sem aprovação registrada em ADR.
- Não usar `console.log` em nenhum arquivo — usar `logger` de `shared/logger.ts`.
- Não criar branches sem seguir a nomenclatura `<type>/<descricao-kebab-case>`.

## Product Rules & Guardrails (Product Specialist)
<!-- TODO (Product Specialist — Ex. 2.3) -->

## Testing Standards (QA)
<!-- TODO (QA — Ex. 2.1) -->

## Project Management Rules (Delivery Manager)
<!-- TODO (Delivery Manager — Ex. 2.3) -->

## Build & Deploy

### Comandos locais

```bash
npm install          # instalar dependências
npm run build        # tsc — compila para dist/
npm test             # vitest run (com cobertura)
npm run lint         # tsc --noEmit (type-check sem emitir)
```

### Cobertura mínima

Vitest configurado com threshold de **80 % de linhas**. O CI rejeita PRs abaixo desse valor. Não desativar a verificação de cobertura para fazer o pipeline passar.

### CI (GitHub Actions — `.github/workflows/ci.yml`)

Etapas obrigatórias em ordem:

1. `npm ci`
2. `npm run lint` (type-check)
3. `npm test` (unit + integration; cobertura ≥ 80 %)
4. `npm run build`

Qualquer etapa que falhe bloqueia o merge.

### CD (`.github/workflows/cd.yml`)

Deploy via `az functionapp deployment` para Azure Functions. Parâmetros de ambiente (chaves de API, endpoints) providos por Azure Key Vault — nunca via variável de ambiente em texto plano no workflow.

### Infraestrutura

Provisionada via Bicep em `infra/`. Qualquer alteração de infraestrutura deve passar por PR separado do código da aplicação. Não aplicar `az deployment` manualmente em produção.

### Variáveis de ambiente obrigatórias

| Variável | Descrição |
|----------|-----------|
| `AZURE_OPENAI_ENDPOINT` | Endpoint do Azure OpenAI |
| `AZURE_OPENAI_API_KEY` | Chave de API |
| `AZURE_OPENAI_DEPLOYMENT` | Nome do deployment GPT-4o |
| `AZURE_SEARCH_ENDPOINT` | Endpoint do Azure AI Search |
| `AZURE_SEARCH_API_KEY` | Chave do Azure AI Search |
| `AZURE_SEARCH_INDEX_NAME` | Nome do índice vetorial |
| `SEMANTIC_RANKER_THRESHOLD` | Score mínimo (default: `3.0`) |

Todas lidas em `shared/config.ts`; a aplicação deve falhar em startup se alguma estiver ausente.
