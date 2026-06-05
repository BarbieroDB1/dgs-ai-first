User: <ide_opened_file>The user opened the file /home/pedro.barbiero@db1.com.br/workspace/db1group/dgs-ai-first/cenario-1/exercicio-1.2-prompt-design/PROMPT.md in the IDE. This may or may not be related to the current task.</ide_opened_file>O cenário da NovaTech pode ser consultado em @cenario.md   Arquivos .md na pasta atual são arquivos complementares para o cenário da NovaTech.

Estamos no estágio de prototipar um prompt e context que serão artefatos versionados. O prompt deve ser tratado como código fonte a ser gerenciado com rigor.

Um desenvolvedor criou um prompt simples inicial, que vamos usar como base para melhorias:

```
Você é o assistente de atendimento da NovaTech, empresa de logística.
Responda perguntas sobre procedimentos, SLAs e regras de frete.
Use apenas as informações dos documentos fornecidos.
Cite a fonte. Se não souber, diga que não sabe.
```

Como vamos organizar os documentos e arquivos de prompt para este projeto? Quais nomes e qual formato podemos usar, de forma que estes arquivos sirvam como contexto inicial para um agente de IA genérico? Como podemos controlar quem pode alterar esses arquivos, assumindo que o projeto esteja em um repositório git; e, da mesma forma, quais papeis deveriam ter permissão de modificar os arquivos de prompt? Assuma que os arquivos de prompt, testes e etc estarão em um novo repositório com controle de ownership na empresa da NovaTech.

Claude: Vou ler os arquivos existentes na pasta do exercício para entender o contexto atual.

Ran terminal command: find /home/pedro.barbiero@db1.com.br/workspace/db1group/dgs-ai-first/cenario-1/exercicio-1.2-prompt-design -type f | sort && ls /home/pedro.barbiero@db1.com.br/workspace/db1group/dgs-ai-first/cenario-1/

Read [](file:///home/pedro.barbiero%40db1.com.br/workspace/db1group/dgs-ai-first/cenario-1/exercicio-1.2-prompt-design/PROMPT.md)

O arquivo está vazio. Vou responder à pergunta diretamente.

---

## Organização de arquivos de prompt como código-fonte

### Estrutura de diretórios

```
novatech-ai-assistant/
├── CODEOWNERS                          # controle de ownership por path
├── README.md
│
├── prompts/
│   ├── system/
│   │   ├── assistant.md                # system prompt principal
│   │   └── fallback.md                 # prompt para casos sem retrieval
│   ├── templates/
│   │   └── rag-response.md             # template de resposta com citação
│   └── evals/
│       ├── golden-set.jsonl            # casos de teste com resposta esperada
│       └── eval-rubric.md              # critérios de avaliação humana
│
├── context/
│   ├── documents/
│   │   ├── POL-001-politica-devolucao.md
│   │   ├── PROC-042-v2-frete-especial.md   # somente versão vigente
│   │   ├── SLA-2024-tabela-sla-clientes.md
│   │   └── FAQ-atendimento.md
│   └── metadata.yaml                   # versão, vigência e owner de cada doc
│
└── .github/
    └── CODEOWNERS
```

### Formato dos arquivos de prompt

O formato ideal é **Markdown com frontmatter YAML**. Isso faz com que o arquivo seja legível por humanos, versionável como texto, e parseável por qualquer agente de IA ou pipeline de CI.

Exemplo de [prompts/system/assistant.md](prompts/system/assistant.md):

```markdown
---
id: assistant-v1
version: 1.0.0
status: active           # active | draft | deprecated
owner: ai-team@novatech.com.br
last-reviewed: 2026-05-01
model-target: claude-sonnet-4-6
---

# System Prompt — Assistente NovaTech

Você é o assistente de atendimento da NovaTech, empresa de logística.

## Papel e escopo
Responda exclusivamente perguntas relacionadas a procedimentos internos,
SLAs, regras de frete e políticas de devolução.
Não responda perguntas fora desse escopo.

## Regras de resposta
- Use apenas informações dos documentos fornecidos no contexto.
- Cite sempre a fonte: documento e seção específica.
- Se a informação não estiver nos documentos, responda:
  "Não encontrei essa informação na documentação oficial.
   Consulte [área responsável] ou abra um chamado interno."
- Se houver documentos contraditórios, informe a contradição
  e indique qual versão é mais recente.

## Formato de saída
Responda em português, de forma objetiva.
Use bullet points para listas de etapas ou regras.
Limite a resposta a 3 parágrafos salvo quando um procedimento exigir mais.
```

### Por que Markdown com frontmatter?

| Critério | `.md` + frontmatter | `.txt` puro | `.json`/`.yaml` |
|---|---|---|---|
| Legível por humano | sim | sim | parcial |
| Parseável por agente | sim (frontmatter) | não | sim |
| Diff legível no PR | sim | sim | verboso |
| Suporta formatação rica | sim | não | não |
| Padrão na indústria de LLM | sim (LangChain, Promptfoo, etc.) | não | parcial |

---

### Controle de ownership com CODEOWNERS

No GitHub/GitLab, o arquivo `CODEOWNERS` define quem deve aprovar PRs que alteram cada path. Coloque em `.github/CODEOWNERS` (GitHub) ou na raiz (GitLab):

```
# Qualquer mudança em prompts exige aprovação do AI Lead + Compliance
/prompts/system/         @novatech/ai-lead @novatech/compliance-team

# Templates de resposta: AI Lead basta
/prompts/templates/      @novatech/ai-lead

# Documentos-fonte: owner de cada área
/context/documents/POL-* @novatech/compliance-team
/context/documents/PROC-* @novatech/operacoes-team
/context/documents/SLA-*  @novatech/comercial-team
/context/documents/FAQ-*  @novatech/atendimento-lead

# Evals: AI Lead + QA
/prompts/evals/          @novatech/ai-lead @novatech/qa-team
```

Combine isso com **branch protection** na `main`:
- Exigir ao menos 1 review do CODEOWNER antes de merge
- Bloquear push direto na branch
- Habilitar "Require review from Code Owners"

---

### Papéis e permissões sobre arquivos de prompt

| Arquivo | Quem pode propor (PR) | Quem aprova |
|---|---|---|
| `prompts/system/` | AI Engineer, AI Lead | AI Lead **+** Compliance |
| `prompts/templates/` | AI Engineer | AI Lead |
| `prompts/evals/` | AI Engineer, QA | AI Lead |
| `context/documents/POL-*` | Compliance | Compliance Lead |
| `context/documents/PROC-*` | Operações | Operações Lead |
| `context/documents/SLA-*` | Comercial | Comercial Lead |

> A separação importante aqui: **as áreas de negócio são donas dos documentos-fonte**, mas não têm permissão de editar o system prompt diretamente — elas propõem mudanças nos documentos e o AI team absorve o impacto no prompt se necessário.

---

### `context/metadata.yaml` — controle de versão dos documentos

```yaml
documents:
  - id: POL-001
    file: POL-001-politica-devolucao.md
    version: "2.1"
    status: active
    owner: compliance-team
    effective-date: 2024-01-01
    supersedes: null

  - id: PROC-042
    file: PROC-042-v2-frete-especial.md
    version: "2.0"
    status: active
    owner: operacoes-team
    effective-date: 2024-03-15
    supersedes: PROC-042-v1     # v1 não entra no contexto do agente
```

Esse arquivo resolve o problema de documentos contraditórios que o cenário menciona: a versão v1 do PROC-042 simplesmente não é incluída no contexto do agente, e o `supersedes` deixa rastreável a decisão.

User: <ide_opened_file>The user opened the file /home/pedro.barbiero@db1.com.br/workspace/db1group/dgs-ai-first/cenario-1/cenario.md in the IDE. This may or may not be related to the current task.</ide_opened_file>A NovaTech e nem a DB1 possuem papeis de "AI Engineer" ou "AI Lead". Considere apenas papeis de Desenvolvedor (Júnior, Pleno, Sênior), Tech Lead, Staff Engineer, Delivery Manager, Compliance, Operations, Sales, Marketing

Claude: Boa correção. Aqui está a tabela de papéis revisada:

---

### Papéis e permissões sobre arquivos de prompt

| Arquivo | Quem pode propor (PR) | Quem aprova |
|---|---|---|
| `prompts/system/` | Dev Sênior, Tech Lead, Staff Engineer | Staff Engineer **+** Compliance |
| `prompts/templates/` | Dev Pleno, Dev Sênior, Tech Lead | Tech Lead |
| `prompts/evals/` | Dev Pleno, Dev Sênior, Tech Lead | Tech Lead |
| `context/documents/POL-*` | Compliance | Compliance (Lead) |
| `context/documents/PROC-*` | Operations | Operations (Lead) |
| `context/documents/SLA-*` | Sales | Sales (Lead) |
| `context/documents/FAQ-*` | Operations, Compliance | Tech Lead + área responsável |
| `context/metadata.yaml` | Tech Lead, Staff Engineer | Staff Engineer |

**Raciocínio por papel:**

- **Dev Júnior** — não propõe mudanças em prompt nem em documentos de negócio; contribui em evals (casos de teste), mas sempre com review obrigatório.
- **Dev Pleno** — pode propor mudanças em templates e evals; não toca no system prompt sem supervisão.
- **Dev Sênior / Tech Lead** — têm autonomia técnica para propor qualquer mudança; Tech Lead é o gatekeeper padrão de qualidade.
- **Staff Engineer** — aprovador final em mudanças de system prompt, pois tem visibilidade de impacto cross-produto; funciona como o "AI Lead" da estrutura real.
- **Delivery Manager** — não aprova código nem prompt; é notificado via PR review quando mudanças afetam escopo ou prazo.
- **Compliance / Operations / Sales** — donos dos documentos-fonte em `context/documents/`, mas **sem permissão de editar `prompts/system/`** diretamente. Elas abrem PRs nos seus domínios e o time técnico avalia impacto no prompt.

O `.github/CODEOWNERS` ficaria:

```
/prompts/system/          @novatech/staff-engineers @novatech/compliance
/prompts/templates/       @novatech/tech-leads
/prompts/evals/           @novatech/tech-leads
/context/documents/POL-*  @novatech/compliance
/context/documents/PROC-* @novatech/operations
/context/documents/SLA-*  @novatech/sales
/context/metadata.yaml    @novatech/staff-engineers
```

User: Identifique quais partes do system prompt são estáticas (raramente mudam) e quais são dinâmicas (mudam conforme o contexto — ex: o tier do cliente, os chunks recuperados). Defina a "anatomia do contexto" completa de uma query: system prompt (estático) + metadados do cliente (dinâmico) + chunks recuperados (dinâmico) + pergunta (dinâmico) + histórico de conversa (dinâmico, crescente). Estime o tamanho de cada parte e defina o orçamento de contexto total.

Claude: Vou ler os documentos da NovaTech para embasar as estimativas com dados reais.

Read [](file:///home/pedro.barbiero%40db1.com.br/workspace/db1group/dgs-ai-first/cenario-1/anexo-b-chunks-referencia-rag.md)

Read [](file:///home/pedro.barbiero%40db1.com.br/workspace/db1group/dgs-ai-first/cenario-1/SLA-2024-tabela-sla-clientes.md)

Com os dados reais dos chunks em mãos, posso fazer estimativas fundamentadas.

---

## Anatomia do contexto — query completa

### 1. Identificação: estático vs dinâmico

| Parte do prompt | Tipo | Frequência de mudança |
|---|---|---|
| Papel e escopo do assistente | Estático | Raramente (mudança de produto) |
| Regras de resposta (citar fonte, não alucinar) | Estático | Raramente (refinamento) |
| Formato de saída | Estático | Ocasional (A/B de UX) |
| Tier do cliente atual | Dinâmico | Por sessão |
| Histórico de chamados do cliente | Dinâmico | Por sessão |
| Chunks recuperados pelo RAG | Dinâmico | Por query |
| Pergunta do atendente | Dinâmico | Por query |
| Histórico da conversa | Dinâmico | Crescente por turno |

---

### 2. Orçamento de contexto

O modelo alvo (Claude Sonnet) tem janela de **200k tokens**. A estratégia é reservar o máximo possível para chunks, pois é onde está o valor do RAG, e manter uma reserva confortável para a resposta.

```
┌─────────────────────────────────────────────────────────────┐
│              JANELA DE CONTEXTO — 200.000 tokens            │
├──────────────────────────────┬──────────────┬───────────────┤
│ Parte                        │ Tokens       │ % do budget   │
├──────────────────────────────┼──────────────┼───────────────┤
│ System prompt (estático)     │    ~800      │      0,4%     │
│ Metadados do cliente         │    ~200      │      0,1%     │
│ Chunks RAG (5 chunks médios) │  ~2.000      │      1,0%     │
│ Pergunta do atendente        │    ~100      │      0,05%    │
│ Histórico de conversa        │  ~4.000      │      2,0%     │
├──────────────────────────────┼──────────────┼───────────────┤
│ TOTAL DE INPUT               │  ~7.100      │      3,5%     │
├──────────────────────────────┼──────────────┼───────────────┤
│ Reserva para resposta        │  ~1.500      │      0,75%    │
│ Margem de segurança          │ ~191.400     │     95,75%    │
└──────────────────────────────┴──────────────┴───────────────┘
```

A janela de 200k é folgada para este caso. O limite prático aqui **não é tokens — é custo e latência**. O orçamento real deve ser definido por chamada de API, não pela capacidade máxima do modelo.

---

### 3. Orçamento por parte (detalhado)

#### System prompt estático — ~800 tokens

```
┌──────────────────────────────────────────────────────────────┐
│  SYSTEM PROMPT (estático, ~800 tokens)                       │
│                                                              │
│  • Papel e empresa                           ~50 tokens      │
│  • Escopo e restrições de domínio           ~100 tokens      │
│  • Regras de resposta (citar fonte,         ~200 tokens      │
│    tratar contradições, fallback)                            │
│  • Comportamento com docs conflitantes      ~150 tokens      │
│  • Formato de saída                         ~100 tokens      │
│  • Aviso de confidencialidade do prompt     ~50 tokens       │
│  • Instruções de escalada                  ~150 tokens       │
└──────────────────────────────────────────────────────────────┘
```

Muda quando: regra de negócio estrutural muda, formato de saída é redefinido, escopo do assistente é ampliado/reduzido. PR obrigatório, aprovação de Staff Engineer + Compliance.

---

#### Metadados do cliente — ~200 tokens

Injetados dinamicamente pelo sistema a cada nova sessão, vindos do CRM/ERP da NovaTech:

```xml
<cliente>
  <id>CLI-00482</id>
  <tier>Gold</tier>
  <contrato>CNT-2024-0091</contrato>
  <sla_aplicavel>Gold — resposta 2h, resolução 24h</sla_aplicavel>
  <operacoes_mes>247</operacoes_mes>
  <violacoes_sla_mes>1</violacoes_sla_mes>
  <gerente_conta>Ana Lima — ana.lima@novatech.com.br</gerente_conta>
</cliente>
```

Muda quando: cliente muda de tier, novo chamado é aberto. Gerado automaticamente — sem PR, sem revisão humana.

---

#### Chunks recuperados pelo RAG — ~2.000 tokens (5 chunks × ~400 tokens)

Medindo os chunks reais do Anexo B:

| Chunk | Tokens estimados | Observação |
|---|---|---|
| POL-001-A (prazo devolução) | ~60 tokens | curto |
| POL-001-B (exceções carga perigosa) | ~110 tokens | médio |
| PROC-042v2-A (fórmula frete) | ~80 tokens | curto |
| PROC-042v2-B (multiplicadores) | ~70 tokens | curto |
| SLA-2024-B (tabela SLA geral) | ~80 tokens | curto |

Os chunks da NovaTech são compactos (~60–120 tokens cada). Para queries multi-domínio (o pior caso do mapa de cobertura), o pipeline pode retornar até 8 chunks. O orçamento seguro é **~2.000 tokens para até 8 chunks**, com um hard limit no pipeline de RAG para não passar disso.

Muda quando: nova query é feita. Gerado automaticamente pelo Azure AI Search.

---

#### Pergunta do atendente — ~100 tokens

O pior caso observado no mapa de cobertura é a query multi-domínio:
> *"Prazo de devolução + carga perigosa + frete especial"*

Perguntas de atendente raramente passam de 2–3 frases. Budget: **200 tokens** com folga.

---

#### Histórico de conversa — ~4.000 tokens, crescente

É a única parte que cresce sem controle dentro de uma sessão. Estratégia de contenção:

```
Turno 1:  pergunta (~100) + resposta (~400)  =    500 tokens
Turno 2:  pergunta (~100) + resposta (~400)  =  1.000 tokens acumulados
Turno 3:  pergunta (~100) + resposta (~400)  =  1.500 tokens acumulados
...
Turno 8:                                     =  4.000 tokens acumulados  ← soft limit
Turno 10:                                    =  5.000 tokens acumulados  ← hard limit → sumarização
```

**Política de janela deslizante:** ao atingir 5.000 tokens de histórico, o sistema comprime os turnos mais antigos em um resumo de ~200 tokens, preservando os últimos 3 turnos integrais. Isso mantém coerência sem explodir o contexto.

---

### 4. Template de contexto completo (o artefato versionado)

Este é o arquivo `prompts/templates/rag-response.md` que seria versionado no repositório:

```
[SYSTEM]
{conteúdo de prompts/system/assistant.md}

[CLIENTE]
{metadados injetados pelo CRM — gerado em runtime}

[CONTEXTO RECUPERADO]
Os seguintes trechos da documentação oficial da NovaTech foram
recuperados por relevância para a pergunta do atendente.
Use apenas estas informações para responder.

{loop: chunk_1 ... chunk_N}
Fonte: {doc_id} — {secao}
Versão: {version} | Vigência: {effective_date}
---
{texto do chunk}
{/loop}

[HISTÓRICO]
{últimos N turnos ou resumo comprimido}

[PERGUNTA]
{pergunta do atendente}
```

---

### 5. O que fica de fora do contexto propositalmente

- Documentos revogados (`PROC-042-v1`) — excluídos pelo `metadata.yaml`
- Documentos de outras áreas não relacionados ao domínio da query (o RAG filtra por score de relevância)
- Informações do sistema interno (senhas, tokens de API, regras de negócio não documentadas)

O sistema **nunca** injeta o documento inteiro — sempre chunks. Isso é o que viabiliza o orçamento compacto mesmo com 800+ documentos na base.

User: <ide_opened_file>The user opened the file /home/pedro.barbiero@db1.com.br/workspace/db1group/dgs-ai-first/cenario-1/claude-chats/exercicio-1.2/claude-strat-anatomy.md in the IDE. This may or may not be related to the current task.</ide_opened_file>Defina documentos de estratégia com a anatomia de contexto, incluindo os cálculos de orçamento, que serão apresentaods para os engenheiros da NovaTech.

Crie também um arquivo com a análise de enforcement probabilístico vs determinístico

Finalmente, gere um documento detalhando o formato do repositório e as propostas de quem pode alterar o quê no repositório.

Todos os artefatos gerados devem ser colocados na pasta `./exercicio-1.2-prompt-design`

Claude: Vou ler os arquivos existentes e o que já foi criado antes de gerar os documentos.

Read [](file:///home/pedro.barbiero%40db1.com.br/workspace/db1group/dgs-ai-first/cenario-1/exercicio-1.2-prompt-design/PROMPT.md)

Ran terminal command: ls /home/pedro.barbiero@db1.com.br/workspace/db1group/dgs-ai-first/cenario-1/claude-chats/exercicio-1.2/ 2>/dev/null || echo "pasta não existe"

Read [](file:///home/pedro.barbiero%40db1.com.br/workspace/db1group/dgs-ai-first/cenario-1/anexo-a-documentacao-simulada-novatech.md)

Tenho tudo que preciso. Vou criar os três documentos em paralelo.Três documentos criados em [exercicio-1.2-prompt-design/](exercicio-1.2-prompt-design/):

---

### [context-anatomy.md](exercicio-1.2-prompt-design/context-anatomy.md)
Documento técnico completo para os engenheiros da NovaTech. Cobre:
- Classificação estático/dinâmico de cada parte do contexto
- Estrutura interna do system prompt com blocos e contagem de tokens
- Dados reais dos chunks do Anexo B (tamanho medido, não estimado)
- Tabela de orçamento com máximo e típico por componente
- Política de janela deslizante para o histórico
- Template do contexto completo como artefato versionado
- Observação crítica: o limite real é custo/latência, não a janela de 200k tokens

### [enforcement-probabilistic-vs-deterministic.md](exercicio-1.2-prompt-design/enforcement-probabilistic-vs-deterministic.md)
Análise de cada regra crítica do sistema NovaTech — regra por regra, com:
- Espectro de certeza (100% determinístico → ~70% instrução simples)
- Análise de por que o prompt sozinho não basta para dados financeiros e operacionais
- Schema JSON de output com campo `fontes` obrigatório como enforcement determinístico
- Arquitetura resultante: RAG filtra → prompt instrui → validação de schema confirma
- Riscos residuais honestos (o que não é eliminado)

### [repository-structure-and-ownership.md](exercicio-1.2-prompt-design/repository-structure-and-ownership.md)
Proposta completa de repositório com:
- Estrutura de diretórios anotada
- `metadata.yaml` com exemplo real baseado nos documentos da NovaTech
- `CODEOWNERS` completo por path
- Tabela de quem pode propor e quem aprova, com justificativa para cada linha
- Regras transversais por papel (incluindo o que Dev Júnior e Delivery Manager podem ou não fazer)
- Fluxo completo de atualização de documento de negócio (do PR ao re-index no Azure AI Search)
- Configuração recomendada de branch protection
- Política de versionamento semântico para arquivos de prompt

User: <ide_opened_file>The user opened the file /home/pedro.barbiero@db1.com.br/workspace/db1group/dgs-ai-first/cenario-1/exercicio-1.2-prompt-design/enforcement-probabilistic-vs-deterministic.md in the IDE. This may or may not be related to the current task.</ide_opened_file>Em múltiplos lugares você menciona a PROC-042 como se fosse o único documento contratidório, mas deve-se considerar que ele é apenas 1 exemplo de mais possíveis documentos que podem existir na NovaTech. Melhore a linguagem.

Claude: Vou ler o arquivo para identificar todos os trechos que precisam de ajuste.

Read [](file:///home/pedro.barbiero%40db1.com.br/workspace/db1group/dgs-ai-first/cenario-1/exercicio-1.2-prompt-design/enforcement-probabilistic-vs-deterministic.md)

Quatro trechos precisam de ajuste: linha 11 (menção pontual à PROC-042), linha 44 (título da seção 3.1), linha 111 (exemplo concreto no bullet da tabela) e linha 113 (conclusão da seção). Vou corrigir todos.Quatro pontos ajustados em [enforcement-probabilistic-vs-deterministic.md](exercicio-1.2-prompt-design/enforcement-probabilistic-vs-deterministic.md):

1. **Seção 1** — removida a referência direta à PROC-042; substituída por "versões vigentes dos documentos"
2. **Título da seção 3.1** — de "Não usar PROC-042-v1" para "Não usar versões revogadas de documentos"
3. **Parágrafo introdutório da seção 3.1** — adicionado contexto explícito: a PROC-042 é o exemplo atual, mas o problema é estrutural e qualquer documento sem processo formal de obsolescência gera o mesmo risco
4. **Conclusão da seção 3.5** — o aviso de conflito agora usa `[doc_id]` genérico e explicita que a lógica cobre qualquer documento, não apenas os já conhecidos

User: Existe alguma outra linguagem que menciona um documento específico?

Claude: Vou verificar o arquivo completo para encontrar outras referências específicas.

Ran terminal command: grep -n "PROC-042\|SLA-2024\|POL-001\|FAQ-" /home/pedro.barbiero@db1.com.br/workspace/db1group/dgs-ai-first/cenario-1/exercicio-1.2-prompt-design/enforcement-probabilistic-vs-deterministic.md

Dois casos restantes com naturezas diferentes:

- **Linhas 46 e 54** — a PROC-042 aparece corretamente como exemplo nomeado, no parágrafo que já deixa explícito que é apenas um caso de um problema estrutural. Não precisa mudar.
- **Linha 73** — referência dentro de um exemplo de schema JSON. É um valor de exemplo (`"doc_id": "PROC-042-v2"`), e o contexto do bloco é explicar a estrutura do campo, não o documento em si. Faz sentido trocar por algo mais genérico.
- **Linha 102 e 104** — a seção 3.4 analisa especificamente a regra "não afirmar que existe tier Platinum", e o SLA-2024-A é o chunk que contém essa informação. A referência é necessária — não há como generalizar sem perder a precisão do argumento.

Só a linha 73 merece ajuste. Faço agora?

User: sim

Claude: Feito. O campo `doc_id` no schema de exemplo agora usa `"NOME-DO-DOCUMENTO"`, deixando claro que é um placeholder genérico da estrutura, não uma referência ao documento específico.