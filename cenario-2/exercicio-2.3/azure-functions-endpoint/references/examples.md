# Examples — azure-functions-endpoint

Load this file when you need a complete working example to follow or when you
need to identify what is wrong with code you are reviewing.

---

## DO — correct query endpoint

```typescript
// src/functions/query/handler.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ZodError } from "zod";
import { QueryInputSchema } from "./validator";
import { queryService } from "../../services/query";
import { logger } from "../../shared/logger";

async function queryHandler(
  req: HttpRequest,
  ctx: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const input = QueryInputSchema.parse(await req.json());

    logger.info({ queryId: input.queryId, conversationId: input.conversationId }, "query request received");

    const result = await queryService.execute(input, ctx);

    logger.info({ queryId: input.queryId, sourceCount: result.sources.length }, "query request completed");

    return { status: 200, jsonBody: result };
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      logger.warn({ details: e.flatten() }, "invalid input");
      return { status: 400, jsonBody: { error: "Requisição inválida", details: e.flatten() } };
    }
    logger.error({ err: e, context: "queryHandler" }, "unexpected error");
    return { status: 500, jsonBody: { error: "Erro interno no processamento da query" } };
  }
}

app.http("query", {
  methods: ["POST"],
  authLevel: "function",
  handler: queryHandler,
});
```

```typescript
// src/functions/query/validator.ts
import { z } from "zod";
import { QueryIdSchema, ConversationIdSchema } from "../../shared/types";

export const QueryInputSchema = z.object({
  queryId:        QueryIdSchema,
  conversationId: ConversationIdSchema,
  question:       z.string().min(1).max(1000),
  domainHints:    z.array(z.string()).optional(),
});
export type QueryInput = z.infer<typeof QueryInputSchema>;

export const QueryOutputSchema = z.object({
  answer:        z.string(),
  sources:       z.array(z.object({ document: z.string(), section: z.string() })),
  confidenceLow: z.boolean(),
  queryId:       QueryIdSchema,
});
export type QueryOutput = z.infer<typeof QueryOutputSchema>;
```

---

## DON'T — patterns to reject

If you generate or review code containing any of the snippets below, stop and
apply the correction listed in the comment.

```typescript
// ❌ authLevel "anonymous" on a business endpoint
// Fix: change to authLevel: "function"
app.http("query", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: queryHandler,
});

// ❌ Zod schema defined inline in the handler
// Fix: move to validator.ts and import
async function queryHandler(req, ctx) {
  const body = z.object({ question: z.string() }).parse(await req.json());
}

// ❌ Azure client instantiated inside the handler
// Fix: import from src/services/<name>.ts
async function queryHandler(req, ctx) {
  const searchClient = new SearchClient(
    process.env.AZURE_SEARCH_ENDPOINT!,
    new AzureKeyCredential(process.env.AZURE_SEARCH_KEY!)
  );
}

// ❌ console.log instead of structured logger
// Fix: logger.info({ queryId }, "message")
async function queryHandler(req, ctx) {
  console.log("receiving query:", req.url);
}

// ❌ handler body not wrapped in try/catch
// Fix: wrap entire body in try/catch following the pattern in SKILL.md
async function queryHandler(req, ctx) {
  const input = QueryInputSchema.parse(await req.json());
  const result = await queryService.execute(input, ctx);
  return { status: 200, jsonBody: result };
}

// ❌ catch (e: any) — disables type checking on the caught value
// Fix: catch (e: unknown), then narrow with instanceof
} catch (e: any) {
  logger.error(e.message);
  return { status: 500, jsonBody: { error: e.message } };
}

// ❌ stack trace or internal message exposed in the response body
// Fix: return a generic message; log the full error internally
} catch (e: unknown) {
  return { status: 500, jsonBody: { error: (e as Error).stack } };
}

// ❌ ctx omitted from the handler signature
// Fix: always include ctx: InvocationContext as the second parameter
async function queryHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const result = await queryService.execute(input); // ctx not passed — tracing broken
}

// ❌ return without explicit status
// Fix: always declare status: 200 | 400 | 500
return { jsonBody: result };

// ❌ manual TypeScript interface instead of z.infer
// Fix: export type QueryInput = z.infer<typeof QueryInputSchema>
interface QueryInput {
  question: string;
  queryId: string;
}
```

---

## Anti-pattern quick-reference

| Generated pattern | Correction |
|---|---|
| `authLevel: "anonymous"` on non-health endpoint | Change to `"function"` |
| `z.object({}).parse(...)` inline in handler | Move to `validator.ts` |
| `new SearchClient(...)` inside handler | Import service from `src/services/` |
| `console.log(...)` anywhere | Replace with `logger.info/warn/error` |
| Handler body without `try/catch` | Wrap in try/catch from SKILL.md template |
| `catch (e: any)` | Use `catch (e: unknown)` + `instanceof` narrowing |
| `jsonBody: { error: e.message }` or `error: e.stack` | Generic message + internal log |
| `ctx` absent from signature | Add `ctx: InvocationContext` as second param |
| `return { jsonBody: result }` without `status` | Add explicit `status: 200` |
| `interface Foo { ... }` instead of schema-derived type | `export type Foo = z.infer<typeof FooSchema>` |
