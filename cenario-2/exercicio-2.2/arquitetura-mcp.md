# Arquitetura de MCP — NovaTech Assistant

> Repositório de referência: `novatech-assistant` (local). Config real em `.mcp/mcp.json`, script de health check em `scripts/mcp-health-check.mjs`, runbook operacional em `docs/runbooks/mcp-monitoramento.md`. Este documento explica as decisões; os artefatos executáveis vivem no repositório do projeto, não aqui.

## Princípio

> MCP servers são infraestrutura: versionados, com escopo mínimo, e observáveis. O Tech Lead autoriza quais servers existem e quais tools cada um expõe. Nenhum server entra em `.mcp/mcp.json` "porque foi conveniente" — entra porque cobre uma necessidade real do time, com o menor escopo possível para isso.

## 1. Diagrama — servers, agentes e escopo

```
                         ┌────────────────────────────────────────┐
                         │   Agentes de IA (consumidores MCP)      │
                         │   Claude Code · GitHub Copilot Chat     │
                         └───────────────┬──────────────────────────┘
                                         │  stdio (JSON-RPC 2.0, processo por sessão)
        ┌───────────────┬────────────────┼────────────────┬────────────────┐
        │               │                │                │                │
        ▼               ▼                ▼                ▼                ▼
 ┌─────────────┐ ┌─────────────┐  ┌────────────┐   ┌────────────┐  ┌──────────────┐
 │filesystem-rw│ │filesystem-ro│  │    git     │   │   memory   │  │  everything  │
 │             │ │             │  │            │   │            │  │              │
 │ ./src       │ │./docs/      │  │ repo local │   │ grafo local│  │  primitivas  │
 │ ./specs     │ │  novatech   │  │ (histórico,│   │(decisões + │  │  MCP p/      │
 │ ./skills    │ │./data/      │  │ diff,      │   │ linguagem  │  │  aprendizado │
 │             │ │  retrieval- │  │ branches)  │   │ ubíqua)    │  │  (não usado  │
 │  rw real    │ │  corpus     │  │            │   │            │  │  em fluxo de │
 │ (código,    │ │             │  │            │   │            │  │  produção)   │
 │  specs,     │ │  ro real    │  │            │   │            │  │              │
 │  skills)    │ │ (chmod a-w  │  │            │   │            │  │              │
 │             │ │  no SO)     │  │            │   │            │  │              │
 └─────────────┘ └─────────────┘  └────────────┘   └────────────┘  └──────────────┘
        │               │                │                │
        ▼               ▼                ▼                ▼
   código-fonte,   docs de negócio    histórico Git    grafo de decisões
   specs SDD,      NovaTech (era      (era GitHub)     e glossário
   skills          Confluence) +      commits, branches (era Confluence/
   (leitura e      corpus de          diffs             wiki de arquitetura)
   escrita)        retrieval (era
                   Azure AI Search)
```

Leitura do diagrama: cada agente (Claude Code, Copilot) fala com **cada server MCP como um processo separado**, subido sob demanda a partir de `.mcp/mcp.json` — não há um "hub" central nem servidor de longa duração. Isso é relevante para a seção de monitoramento: não existe um serviço para dar `ping`, existe um comando para invocar sob demanda.

### Quem consome o quê

| Agente | Servers que usa | Propósito |
|---|---|---|
| Claude Code (implementação, specs, skills) | `filesystem-rw`, `git`, `memory` | Ler/editar código e specs, consultar histórico antes de decisões, gravar decisões e termos no grafo |
| Claude Code / Copilot (consulta a negócio/RAG) | `filesystem-ro` | Ler documentação NovaTech e corpus de retrieval para fundamentar respostas — nunca para alterá-los |
| Qualquer agente, sessão de aprendizado | `everything` | Explorar primitivas do protocolo (tools/resources/prompts) — não faz parte do fluxo de entrega |
| Tech Lead / Dev Sênior (revisão de escopo) | Nenhum diretamente — revisam `.mcp/mcp.json` e o resultado do health check | Gate de aprovação (seção 2) |

### Por que dois servers de filesystem, e não um

A distribuição do enunciado (`filesystem -> ./src ./specs ./skills (rw) + ./docs/novatech ./data/retrieval-corpus (read-only)`) implica escopos diferentes num único server. Na prática, a versão atual de `@modelcontextprotocol/server-filesystem` **não diferencia leitura/escrita por diretório** — todo diretório passado em `args` recebe as mesmas tools (`write_file`, `edit_file` inclusos). Um único server com os cinco diretórios juntos tornaria "read-only" apenas uma convenção de prompt, não um limite real.

Decisão: **dois servers**, `filesystem-rw` e `filesystem-ro`, cada um com seu próprio conjunto de raízes — e o "read-only" do segundo é reforçado com permissão real do sistema operacional (`chmod -R a-w`), não apenas pela ausência de instrução. Assim, mesmo que um agente tente `write_file` em `docs/novatech/`, o processo do server aceita a chamada mas o SO recusa com `EACCES` — o escopo é uma propriedade do sistema de arquivos, não da boa vontade do modelo ou do prompt.

## 2. Política de aprovação de novo server

Nenhum server é adicionado a `.mcp/mcp.json` sem passar pelo fluxo abaixo. Isso vale tanto para um server novo quanto para mudar o escopo (`args`) de um já existente.

1. **Proposta** — quem quer o server (Dev, QA, Product Specialist) abre um PR alterando `.mcp/mcp.json` e descrevendo na mensagem do commit/PR:
   - Qual necessidade concreta motiva o server (não "pode ser útil", e sim uma tarefa específica bloqueada sem ele).
   - Qual pacote/comando (`npx`/`uvx`), de qual origem (`modelcontextprotocol/servers` ou outro reference server auditável).
   - Escopo mínimo proposto: quais diretórios/tools, com qual permissão.
   - Resultado de `npm run mcp:health` rodando localmente com a mudança.
2. **Revisão de escopo e permissões** — o **Tech Lead** é o único aprovador de `.mcp/mcp.json` (dono da infraestrutura de agentes, conforme AGENTS.md). A revisão verifica:
   - O escopo é o menor possível para a necessidade descrita (ex.: um diretório específico, não a raiz do repo).
   - Se o server expõe tools de escrita (`write_file`, `git_commit`, etc.), se a superfície de dano é aceitável dado o escopo.
   - Se o pacote é um *reference server* mantido pelo protocolo ou equivalente auditável — sem dependência de serviço pago ou de credenciais externas, mantendo a decisão de cenário 1 de trabalhar 100% local.
   - Se já existe um server que cobre a necessidade com escopo mais restrito antes de adicionar um novo.
3. **Segunda opinião em mudança de escopo de servers já em uso** — se a mudança *reduz ou remove* acesso que specs/skills/prompts existentes dependem, o **Dev Sênior** também revisa (mesmo padrão de dois aprovadores usado em `plan.md` nas specs SDD), para pegar dependências que o Tech Lead sozinho poderia não notar.
4. **Merge condicionado ao health check** — CI (ou checagem local pré-merge) roda `npm run mcp:health` contra o `.mcp/mcp.json` resultante. PR não é mesclado com o script retornando código de saída diferente de `0`.
5. **Registro** — toda mudança aprovada é uma entrada no changelog de MCP (ver seção 4) e, se mudar uma decisão estrutural (ex.: por que dois servers de filesystem em vez de um), vira observação no grafo do server `memory`, não apenas comentário de PR perdido no histórico.

Quem **não** pode aprovar sozinho: Dev pleno, QA, Product Specialist, Delivery Manager — podem propor, não aprovar. Isso espelha o padrão já usado no repositório para `plan.md` (escrito pelo Tech Lead, aprovado por Product Specialist + Dev Sênior): infraestrutura de agente tem o mesmo nível de cuidado que arquitetura de código.

## 3. Monitoramento — servers locais, sem serviço de longa duração

Como todo server MCP aqui é um processo `npx`/`uvx` subido sob demanda pelo cliente (não um daemon), "monitorar" não é observar um serviço rodando — é ter um comando que **exercita o mesmo handshake que o cliente faria** e relata o resultado. Esse comando existe e roda de verdade: [`scripts/mcp-health-check.mjs`](../../../db1/novatech-assistant/scripts/mcp-health-check.mjs) no repositório do projeto, invocável via `npm run mcp:health`.

O que ele detecta, e como:

| Falha | Como o script percebe |
|---|---|
| Server parou de responder / trava no handshake | Timeout (15s) esperando a resposta de `initialize` — reportado como `FALHOU — timeout` |
| Pacote não existe / nome ou versão errados | Processo do `npx`/`uvx` sai com código de erro antes do handshake; o script captura os últimos 500 caracteres de stderr e devolve o motivo real (ex.: `404 Not Found`) |
| Server perdeu acesso a uma pasta (deletada, renomeada, permissão alterada) | Para servers `filesystem-*`, o script resolve cada diretório em `args` e testa `existsSync` + `accessSync(R_OK/W_OK)` **no sistema operacional real**, independente do que o server "acha" que tem acesso |
| Escopo declarado divergiu do escopo real (ex.: alguém rodou `chmod +w` num diretório que deveria ser `ro`) | O script compara a permissão observada contra um mapa de escopo esperado (`EXPECTED_FS_SCOPE`) e sinaliza `[ESPERADO ro]` quando não bate |
| `tools/list` retorna menos/mais tools que o esperado (mudança de versão do pacote) | Lista de tools é impressa em toda execução `OK` — visível em diff se comparado entre rodadas (ex.: no log de CI) |

Execução esperada:
- **Ad hoc**, sempre que um agente reporta erro de ferramenta MCP (primeiro passo de diagnóstico).
- **A cada início de sessão de trabalho relevante** (onboarding de uma feature nova, retomada após dias parado).
- **Em CI**, como gate de qualquer PR que toque `.mcp/mcp.json` (seção 2, passo 4).

Testado neste exercício: rodei o script contra a configuração real do projeto (5 servers sobem e respondem corretamente) e também contra uma configuração propositalmente quebrada (diretório inexistente, pacote npm inexistente) para confirmar que as falhas são detectadas e reportadas com causa acionável, não um erro genérico.

## 4. Versionamento — mudar escopo sem quebrar fluxos existentes

`.mcp/mcp.json` é um artefato versionado no Git, igual a código. Regras para evoluir sem quebrar quem já depende do escopo atual:

1. **Nunca editar em `main` diretamente** — mudança de escopo segue o mesmo fluxo de branch/PR do resto do código (ver `AGENTS.md`, Conventional Commits — usar `chore(mcp): ...` ou `feat(mcp): ...`).
2. **Reduzir escopo é uma mudança potencialmente quebrando fluxo** — antes de remover um diretório do `filesystem-rw`/`filesystem-ro` ou remover uma tool exposta, buscar no repositório (`git grep`) por specs, skills e prompts que referenciam aquele caminho. Se algo depende, a spec/skill precisa ser atualizada no mesmo PR — escopo e uso não podem divergir.
3. **Ampliar escopo exige a mesma revisão que reduzir** — "só estou adicionando" não é isenção de revisão; é onde o escopo mínimo mais se perde com o tempo.
4. **Cada mudança aprovada gera uma entrada no changelog de MCP** (`docs/runbooks/mcp-monitoramento.md`, ou um `docs/adr/NNNN-...md` se a mudança for estrutural, ex.: adicionar um server novo ou dividir um em dois como `filesystem-rw`/`filesystem-ro`) — mesmo padrão já usado para `prompts/prompt-changelog.md`. Registra: data, autor, motivo, o que mudou, resultado do health check.
5. **`npm run mcp:health` é o teste de regressão de infraestrutura de MCP** — assim como testes automatizados protegem código, o health check protege a configuração de MCP contra "isso não devia estar assim" silencioso. Ele roda contra o estado atual do repositório (permissões reais de arquivo, não apenas o JSON), então detecta divergência entre o que foi decidido e o que está de fato no disco.
6. **Servers não usados saem do arquivo** — `everything` está listado porque serve para aprendizado das primitivas MCP, não para o fluxo de entrega; se deixar de ser usado para isso, deve ser removido, não deixado "por via das dúvidas". Escopo mínimo vale para a lista de servers, não só para os caminhos de cada um.

## 5. Plano de contingência — agente operando com um MCP fora do ar

Um server local pode ficar indisponível por vários motivos: `npx`/`uvx` sem rede para baixar o pacote na primeira vez, processo travado, diretório removido/sem permissão, versão do pacote quebrada. Como não há redundância (é tudo local, um processo por sessão), o objetivo não é "restaurar automaticamente" — é o **agente perceber a falha rápido, não travar a tarefa inteira por causa dela, e ser transparente sobre o que ficou faltando**.

### Regra geral (vale para qualquer server)

1. **Detectar antes de insistir.** Se uma chamada de tool falhar (timeout, erro de conexão, "tool not found"), o agente não deve tentar de novo silenciosamente mais que uma vez. Uma segunda falha é sinal de indisponibilidade real, não hiccup.
2. **Rodar `npm run mcp:health`** (ou pedir ao usuário para rodar, se o agente não tiver acesso a shell na sessão) para confirmar qual server caiu e por quê — a mensagem de erro do script (timeout, diretório ausente, pacote não encontrado) já indica a causa provável, evitando diagnóstico às cegas.
3. **Isolar o dano ao que depende daquele server** — continuar o que não depende dele em vez de abortar a tarefa inteira. A tabela abaixo define, server a server, o que "continuar" significa.
4. **Comunicar a degradação de forma explícita** — toda resposta produzida enquanto um server está fora do ar deve declarar isso (ex.: "não consultei o histórico de commits porque o server `git` está indisponível; a mudança abaixo não foi checada contra commits recentes"). Silêncio sobre uma capacidade perdida é o oposto de degradação elegante — o usuário precisa saber que o piso mudou.
5. **Nunca compensar a falta de um server tentando reconstruir a mesma informação por outro meio não confiável** (ex.: adivinhar o conteúdo de um documento porque `filesystem-ro` caiu, ou inventar um hash de commit porque `git` caiu). Degradar significa fazer menos com garantia, não fazer o mesmo com menos confiança.

### Fallback por server

| Server indisponível | Impacto | Ação do agente (graceful degradation) |
|---|---|---|
| `filesystem-rw` | Não consegue ler/editar `src`, `specs`, `skills` | Parar edições de código/specs — não há como validar o que já existe nem persistir mudanças com segurança. Reportar ao usuário e sugerir rodar `npm run mcp:health` para diagnosticar antes de continuar. Não é seguro "degradar parcialmente" aqui: sem este server não há tarefa de implementação possível. |
| `filesystem-ro` | Não consegue ler `docs/novatech` (documentação de negócio) nem `data/retrieval-corpus` (corpus de retrieval) | Continuar tarefas que não dependem de contexto de negócio (ex.: refatoração puramente técnica, ajuste de tipos). Para qualquer resposta que normalmente citaria a documentação NovaTech ou chunks de retrieval, **declarar explicitamente que a resposta não foi fundamentada em fonte primária** em vez de responder de memória/treino como se fosse — isso é especialmente sensível dado o histórico de documentos contraditórios (ADR-0003): responder sem checar a fonte "vigente" pode reintroduzir exatamente o problema que o metadado de vigência resolve. |
| `git` | Não consegue ler histórico, diff ou branches | Continuar edições de arquivo normalmente (não depende de `git` para isso), mas declarar que mudanças não foram checadas contra o histórico recente (ex.: risco de reintroduzir algo revertido, ou de não perceber que outro branch já mexeu no mesmo trecho). Não commitar/criar branch via automação enquanto o server estiver fora — pedir ao usuário para validar o estado do repo manualmente antes de qualquer operação de escrita em Git. |
| `memory` | Não consegue ler/gravar o grafo de decisões e linguagem ubíqua | Continuar a tarefa usando o que já está documentado em arquivos versionados (ADRs, specs, `AGENTS.md`) como fonte de verdade substituta — são mais lentos de consultar, mas confiáveis. Decisões ou termos novos que surgirem durante a sessão devem ser anotados na resposta ao usuário como "pendente de registro no grafo de memória assim que o server voltar", para não se perderem. |
| `everything` | Nenhum — não faz parte do fluxo de entrega | Nenhuma ação necessária; é usado apenas para aprendizado das primitivas MCP. Não bloqueia nada em produção/desenvolvimento real. |

### Quando escalar em vez de degradar

Se **mais de um server essencial** (`filesystem-rw`, `git`, `filesystem-ro`) estiver indisponível ao mesmo tempo, ou se a mesma falha persistir entre sessões (não é transitória), o agente deve parar de tentar contornar e sinalizar ao Tech Lead — isso deixa de ser uma degradação pontual e passa a ser sintoma de um problema de ambiente (rede, disco, permissões quebradas) que precisa de correção manual, não de mais uma tarefa tocada "com menos ferramentas".

## Referências

- Config real: `novatech-assistant/.mcp/mcp.json`
- Script de health check: `novatech-assistant/scripts/mcp-health-check.mjs` (`npm run mcp:health`)
- Runbook operacional: `novatech-assistant/docs/runbooks/mcp-monitoramento.md`
- Anexo C (estrutura de repositório) e mapeamento de MCP fornecido pelo desenvolvedor nesta fase
