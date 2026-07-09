# Runbook — Monitoramento dos MCP servers locais

## O que existe

Todos os MCP servers do projeto rodam localmente via `npx`/`uvx`, subidos sob demanda pelo cliente (Claude Code / Copilot) a partir de `.mcp/mcp.json`. Não há processo de longa duração para monitorar — "estar no ar" para um server MCP local significa **responder corretamente ao handshake MCP quando invocado**, e **ter acesso real ao filesystem que lhe foi delegado**.

Por isso o "monitoramento" aqui é um script, não um dashboard: [`scripts/mcp-health-check.mjs`](../../scripts/mcp-health-check.mjs).

## O que o health check verifica de fato

Para cada server em `.mcp/mcp.json`, o script:

1. Sobe o processo (`command` + `args`) exatamente como o cliente subiria.
2. Envia `initialize` via stdio (protocolo JSON-RPC 2.0 do MCP) e mede a latência até a resposta.
3. Envia `tools/list` e confere se o server devolve a lista de tools sem erro.
4. Encerra o processo.

Para qualquer server cujo nome comece com `filesystem` (`filesystem-rw`, `filesystem-ro`), adicionalmente:

5. Resolve cada diretório passado em `args` e confere, no sistema operacional real (não apenas na config): se existe, se é legível, se é gravável.
6. Compara o resultado observado contra o escopo esperado (mapa `EXPECTED_FS_SCOPE` no topo do script) e sinaliza divergência — por exemplo, se `docs/novatech` deixar de ser somente-leitura porque alguém rodou `chmod` sem querer, ou se um diretório for removido/renomeado.

Saída: uma linha por server (`OK` com latência e tools, ou `FALHOU` com o motivo — timeout, processo morto, pacote não encontrado, diretório inacessível) e um código de saída (`0` = tudo saudável, `1` = pelo menos uma falha). Isso o torna utilizável em CI ou em um hook local, não só lido por humano.

## Como rodar

```bash
npm run mcp:health
# equivalente a: node scripts/mcp-health-check.mjs .mcp/mcp.json
```

Rodar:
- **Antes de começar a trabalhar** (sessão nova de agente) — garante que os servers configurados de fato sobem.
- **Depois de qualquer mudança em `.mcp/mcp.json`** (novo server, escopo alterado) — ver "Versionamento de escopo" abaixo.
- **Quando um agente reporta erro de ferramenta MCP** (timeout, "tool not found", "permission denied") — primeiro passo de diagnóstico antes de abrir uma issue.

## Como interpretar uma falha

| Sintoma no health check | Causa provável | Ação |
|---|---|---|
| `FALHOU — timeout após Nms` | Pacote precisa baixar do npm/PyPI e a rede está lenta/offline, ou o processo travou | Rodar o comando isolado (`npx -y @modelcontextprotocol/server-... `) manualmente para ver o log completo; checar conectividade |
| `FALHOU — processo encerrou (code N) ... stderr: ...` | Argumento inválido, diretório inexistente, pacote não encontrado (nome/versão errados) | Ler o stderr embutido na mensagem — é o motivo real do server, não um genérico |
| `./docs/novatech -> sem leitura [FALHA]` | Permissão do SO foi alterada (ex.: alguém rodou `chmod` no diretório) | Restaurar permissão: diretórios `ro` devem ser `dr-xr-xr-x` / arquivos `-r--r--r--` |
| `./src -> ro [ESPERADO rw]` | Escopo declarado em `EXPECTED_FS_SCOPE` não bate com a permissão real do SO | Ou a permissão do SO está errada, ou o mapa de escopo esperado no script ficou desatualizado — reconciliar os dois, nunca só silenciar o alerta |

## Por que a checagem de escopo do filesystem existe

A versão atual do `@modelcontextprotocol/server-filesystem` **não impõe** somente-leitura por diretório — ela expõe `write_file`/`edit_file` para qualquer diretório passado em `args`, mesmo que a intenção seja "somente leitura". Por isso o projeto:

- Separa o filesystem em **dois servers**: `filesystem-rw` (`./src ./specs ./skills`) e `filesystem-ro` (`./docs/novatech ./data/retrieval-corpus`) — ver `.mcp/mcp.json`.
- Aplica a restrição de verdade **no sistema operacional**: `docs/novatech/` e `data/retrieval-corpus/` estão com permissão `dr-xr-xr-x` (diretório) / `-r--r--r--` (arquivos), então uma tentativa de `write_file` do agente falha com `EACCES` do próprio SO, não por boa vontade do server.
- O health check confere essa permissão real a cada execução — se alguém rodar `chmod +w` nesses diretórios por engano, o próximo `npm run mcp:health` acusa a divergência.

Recriar a restrição depois de qualquer mudança nesses diretórios:

```bash
chmod -R a-w docs/novatech data/retrieval-corpus
```

## Versionamento de escopo

Ver o documento de arquitetura de MCP do projeto (`arquitetura-mcp.md`, exercício 2.2) para o processo completo de PR/revisão ao mudar `.mcp/mcp.json`. Regra prática deste repositório: nenhuma mudança em `.mcp/mcp.json` é mesclada sem que `npm run mcp:health` rode limpo (exit 0) localmente e sem que o Tech Lead confirme que nenhum agente/skill em uso depende do escopo removido.
