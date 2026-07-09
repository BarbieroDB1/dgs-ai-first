---
name: azure-functions-endpoint
description: >
  Implements an HTTP endpoint using Azure Functions v4 with TypeScript in the
  NovaTech Assistant project. Use when asked to create an endpoint, add a handler,
  implement an HTTP trigger, or add a new Azure Function. Covers the mandatory
  three-file structure (handler / validator / response-builder), Zod boundary
  validation, structured error handling, pino logging, and authLevel rules.
license: Proprietary
compatibility: Requires @azure/functions v4 (not v3), zod ^3.23, pino. Node.js runtime on Azure Functions. TypeScript strict mode enforced.
metadata:
  level: domain
  depends-on: "skills/foundation/typescript-conventions, skills/foundation/error-handling, skills/foundation/project-structure"
  used-by: skills/artifact/create-rag-endpoint
  owner: tech-lead
  project: novatech-assistant
---

## File structure

Each endpoint lives under `src/functions/<name>/` and is always exactly three files.
Do not merge them. Do not add extra files unless there is formatting logic complex
enough to deserve `response-builder.ts`.

```
src/functions/<name>/
  handler.ts          — trigger registration + request orchestration
  validator.ts        — Zod schemas + derived TypeScript types
  response-builder.ts — response formatting (omit if trivial)
```

Services with business logic live in `src/services/` and are imported by the handler.
The handler never contains business logic; services never contain HTTP code.

---

## Step-by-step

### 1. Create `validator.ts` first

Write both schemas before writing the handler so the handler's types compile.

```typescript
// src/functions/<name>/validator.ts
import { z } from "zod";
import { QueryIdSchema, ConversationIdSchema } from "../../shared/types";

export const <Name>InputSchema = z.object({
  queryId:        QueryIdSchema,
  conversationId: ConversationIdSchema,
  question:       z.string().min(1).max(1000),
  // add domain-specific fields here
});
export type <Name>Input = z.infer<typeof <Name>InputSchema>;

export const <Name>OutputSchema = z.object({
  answer:        z.string(),
  sources:       z.array(z.object({ document: z.string(), section: z.string() })),
  confidenceLow: z.boolean(),
  queryId:       QueryIdSchema,
});
export type <Name>Output = z.infer<typeof <Name>OutputSchema>;
```

Rules:
- Types are always derived via `z.infer` — never write a separate `interface`.
- If a type already exists in `src/shared/types.ts`, import it — do not redefine.
- All schemas go in this file; the handler imports schemas, not types.

### 2. Write `handler.ts`

```typescript
// src/functions/<name>/handler.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ZodError } from "zod";
import { <Name>InputSchema } from "./validator";
import { <name>Service } from "../../services/<name>";
import { logger } from "../../shared/logger";

async function <name>Handler(
  req: HttpRequest,
  ctx: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const input = <Name>InputSchema.parse(await req.json());

    logger.info({ queryId: input.queryId }, "<name> request received");

    const result = await <name>Service.execute(input, ctx);

    logger.info({ queryId: input.queryId }, "<name> request completed");

    return { status: 200, jsonBody: result };
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      logger.warn({ details: e.flatten() }, "invalid input");
      return { status: 400, jsonBody: { error: "Requisição inválida", details: e.flatten() } };
    }
    logger.error({ err: e, context: "<name>Handler" }, "unexpected error");
    return { status: 500, jsonBody: { error: "Erro interno" } };
  }
}

app.http("<name>", {
  methods: ["POST"],
  authLevel: "function",
  handler: <name>Handler,
});
```

### 3. Run the checklist before finishing

- [ ] `authLevel: "function"` set — only the `health` endpoint may use `"anonymous"`
- [ ] Handler signature: `(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit>`
- [ ] `ctx` received even if the handler does not use it directly
- [ ] Schema defined in `validator.ts`, not inline in the handler
- [ ] `.parse()` used (not `.safeParse()`) at the request boundary
- [ ] `try/catch` wraps the entire handler body
- [ ] `catch (e: unknown)` — not `catch (e: any)`
- [ ] No stack trace or internal error message in the response body
- [ ] No `console.log`, `console.warn`, or `console.error` anywhere
- [ ] Every log call includes `queryId` or `conversationId`
- [ ] No `new SearchClient(...)` or `new OpenAIClient(...)` inside the handler
- [ ] Every `return` has an explicit `status` field
- [ ] No manual `interface` — only `z.infer` for TypeScript types

---

## Gotchas

- **`ctx` must always be in the signature.** Services that need the Azure
  correlation ID receive it from `ctx`. Omitting it compiles fine but silently
  breaks request tracing in production logs.

- **`authLevel: "anonymous"` is the most common LLM mistake.** It is the
  default in many Azure Functions templates and tutorials. Always override to
  `"function"` unless you are writing the health check endpoint.

- **`.parse()` vs `.safeParse()`.** Use `.parse()` at the HTTP boundary so a
  `ZodError` propagates to the `catch` block and returns HTTP 400. Use
  `.safeParse()` only when a validation failure is an expected business case you
  need to inspect and handle inline (e.g., an optional chunk that can be skipped).

- **`shared/types.ts` is the single source of truth for value objects.**
  `QueryId`, `ChunkId`, `ConversationId`, and `SemanticScore` are branded types
  defined there. Redefining them locally produces a different type that the
  compiler treats as compatible — the divergence is invisible until values cross
  module boundaries.

- **Response text in Portuguese, log messages in English.** The `error` field in
  JSON responses is shown to end users and must be in Portuguese. Strings passed
  to `logger.*` are for operators and must be in English.

---

## Examples

See [`references/examples.md`](references/examples.md) for the full DO/DON'T
pair for the `query` endpoint and the complete list of anti-patterns that LLMs
generate without this skill.
