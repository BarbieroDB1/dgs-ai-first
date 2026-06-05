# Estrutura do Repositório e Ownership

**Versão:** 1.0  
**Audiência:** Engenheiros NovaTech e DB1  
**Status:** Draft para revisão técnica

---

## 1. Premissas

- Repositório novo, hospedado na organização NovaTech no GitHub/Azure DevOps
- Branch principal protegida (`main`): sem push direto, merge apenas via PR com aprovação obrigatória de CODEOWNERS
- Os papéis disponíveis na NovaTech e DB1 são: Dev Júnior, Dev Pleno, Dev Sênior, Tech Lead, Staff Engineer, Delivery Manager, Compliance, Operations, Sales
- Documentos de negócio (POL, PROC, SLA, FAQ) são propriedade das áreas, não do time técnico
- O time técnico é dono dos prompts e da infraestrutura — não das regras de negócio

---

## 2. Estrutura de diretórios

```
novatech-ai-assistant/
│
├── .github/
│   ├── CODEOWNERS                  # ownership por path
│   └── workflows/
│       ├── eval.yml                # roda golden set em todo PR para prompts/
│       └── reindex.yml             # re-indexa documentos no Azure AI Search
│
├── prompts/
│   ├── system/
│   │   ├── assistant.md            # system prompt principal (versionado)
│   │   └── fallback.md             # resposta padrão quando RAG retorna vazio
│   ├── templates/
│   │   └── context-assembly.md     # template de montagem do contexto completo
│   └── evals/
│       ├── golden-set.jsonl        # casos de teste com input e resposta esperada
│       └── eval-rubric.md          # critérios de avaliação para revisão humana
│
├── context/
│   ├── documents/
│   │   ├── POL-001-politica-devolucao.md
│   │   ├── PROC-042-v2-frete-especial.md   # somente versão vigente
│   │   ├── SLA-2024-tabela-sla-clientes.md
│   │   └── FAQ-atendimento.md
│   └── metadata.yaml               # versão, vigência, owner e status de cada doc
│
├── src/
│   ├── pipeline/
│   │   ├── chunker.py              # divide documentos em chunks para indexação
│   │   ├── indexer.py              # envia chunks ao Azure AI Search
│   │   └── retriever.py            # busca chunks por similaridade semântica
│   ├── context/
│   │   ├── assembler.py            # monta o contexto completo antes de chamar o LLM
│   │   └── conflict_detector.py    # detecta chunks de versões conflitantes
│   └── api/
│       └── handler.py              # endpoint que recebe query e retorna resposta
│
├── tests/
│   ├── unit/
│   └── integration/
│       └── rag_pipeline_test.py    # testa retrieval com perguntas do golden set
│
├── docs/
│   ├── context-anatomy.md          # este repositório explica a anatomia do contexto
│   ├── enforcement-analysis.md     # análise probabilístico vs determinístico
│   └── adr/
│       └── ADR-001-model-choice.md
│
└── README.md
```

---

## 3. Arquivo `context/metadata.yaml`

Controla quais documentos entram no índice RAG e qual versão é vigente. É o mecanismo determinístico que impede documentos revogados de chegarem ao modelo.

```yaml
documents:
  - id: POL-001
    file: context/documents/POL-001-politica-devolucao.md
    version: "3.1"
    status: active           # active | deprecated | draft
    owner: compliance
    effective_date: "2024-01-15"
    supersedes: null

  - id: PROC-042-v2
    file: context/documents/PROC-042-v2-frete-especial.md
    version: "2.0"
    status: active
    owner: operations
    effective_date: "2023-12-01"
    supersedes: PROC-042-v1  # v1 não está no diretório — foi arquivada

  - id: SLA-2024
    file: context/documents/SLA-2024-tabela-sla-clientes.md
    version: "2024.1"
    status: active
    owner: sales
    effective_date: "2024-01-02"
    supersedes: null

  - id: FAQ-atendimento
    file: context/documents/FAQ-atendimento.md
    version: "informal"
    status: active
    owner: operations
    effective_date: null
    reliability: low         # chunks deste doc são marcados com confianca: baixa
    supersedes: null
```

Somente documentos com `status: active` são indexados. Alterar o `status` de um documento para `deprecated` é equivalente a removê-lo do contexto do assistente — sem precisar deletar o arquivo.

---

## 4. Formato do system prompt (`prompts/system/assistant.md`)

```markdown
---
id: assistant-system-prompt
version: 1.0.0
status: active
owner: tech-lead
last_reviewed: 2026-06-04
model_target: claude-sonnet-4-6
approved_by: [staff-engineer, compliance]
---

# System Prompt — Assistente NovaTech

Você é o assistente de atendimento da NovaTech, empresa de logística.
...
```

O frontmatter YAML é parseado pelo pipeline de CI para:
- Verificar que `approved_by` contém os papéis obrigatórios antes de merge
- Registrar `last_reviewed` no log de auditoria
- Validar que `model_target` é um modelo suportado na configuração de infraestrutura

---

## 5. Ownership por path (`CODEOWNERS`)

```
# .github/CODEOWNERS

# System prompt: mudanças estruturais no comportamento do assistente
# Exige aprovação do Staff Engineer (visão técnica) + Compliance (risco regulatório)
/prompts/system/                    @novatech/staff-engineers @novatech/compliance

# Templates de contexto: como o contexto é montado
# Tech Lead tem visão suficiente sobre impacto técnico
/prompts/templates/                 @novatech/tech-leads

# Evals: qualidade das respostas do assistente
# Tech Lead gerencia qualidade; Dev Sênior pode contribuir
/prompts/evals/                     @novatech/tech-leads

# Documentos de negócio: cada área é dona da sua documentação
/context/documents/POL-*            @novatech/compliance
/context/documents/PROC-*           @novatech/operations
/context/documents/SLA-*            @novatech/sales
/context/documents/FAQ-*            @novatech/operations

# metadata.yaml: controla o que entra ou sai do índice RAG
# Mudança aqui pode silenciar ou reativar um documento inteiro
/context/metadata.yaml              @novatech/staff-engineers @novatech/tech-leads

# Código do pipeline: chunking, indexação, retrieval
/src/pipeline/                      @novatech/tech-leads
/src/context/                       @novatech/tech-leads

# ADRs: decisões de arquitetura
/docs/adr/                          @novatech/staff-engineers

# Workflows de CI: afetam o processo de validação de todos os PRs
/.github/workflows/                 @novatech/staff-engineers
```

---

## 6. Quem pode propor e quem aprova: tabela completa

| Arquivo / Diretório | Pode abrir PR | Aprovação obrigatória | Justificativa |
|---|---|---|---|
| `prompts/system/` | Dev Sênior, Tech Lead, Staff Engineer | Staff Engineer **+** Compliance | Mudança no system prompt altera o comportamento do assistente para todos os chamados. Compliance garante conformidade regulatória. |
| `prompts/templates/` | Dev Pleno, Dev Sênior, Tech Lead | Tech Lead | Afeta a montagem do contexto — impacto técnico, não regulatório. |
| `prompts/evals/` | Dev Pleno, Dev Sênior, Tech Lead | Tech Lead | Qualidade dos testes é responsabilidade técnica. |
| `context/documents/POL-*` | Compliance | Compliance (papel sênior da área) | Política de devolução é normativa. Equipe técnica não tem autoridade para alterá-la. |
| `context/documents/PROC-*` | Operations | Operations (papel sênior da área) | Procedimentos operacionais: responsabilidade de Operações. |
| `context/documents/SLA-*` | Sales | Sales (papel sênior da área) | SLAs são compromissos contratuais com clientes. |
| `context/documents/FAQ-*` | Operations, Dev Sênior | Tech Lead + Operations | FAQ informal: Tech Lead valida que mudanças não introduzem contradições com docs formais. |
| `context/metadata.yaml` | Tech Lead, Staff Engineer | Staff Engineer | Alterar status de um doc para `deprecated` remove-o do contexto do assistente. Decisão de alto impacto. |
| `src/pipeline/` | Dev Pleno, Dev Sênior, Tech Lead | Tech Lead | Código de infraestrutura RAG. |
| `src/context/assembler.py` | Dev Sênior, Tech Lead | Tech Lead | Monta o contexto que o modelo recebe — mudanças afetam todas as queries. |
| `docs/adr/` | Tech Lead, Staff Engineer | Staff Engineer | Decisões de arquitetura são irreversíveis ou caras de reverter. |
| `.github/CODEOWNERS` | Staff Engineer | Staff Engineer | Alterar CODEOWNERS pode remover barreiras de aprovação. Protegido contra mudança acidental. |
| `.github/workflows/` | Tech Lead, Staff Engineer | Staff Engineer | Mudança nos workflows de CI afeta o processo de validação de todos os PRs. |

### Regras transversais

- **Dev Júnior:** pode abrir PRs em `tests/` e `prompts/evals/` (casos de teste), sempre com review de Dev Sênior ou Tech Lead. Não abre PRs em prompts ou documentos de negócio.
- **Delivery Manager:** não abre PRs em nenhum diretório técnico. É adicionado como reviewer opcional em PRs de `prompts/system/` para visibilidade de impacto em prazo/escopo — mas a aprovação dele não é suficiente para merge.
- **Áreas de negócio (Compliance, Operations, Sales):** são donas dos documentos em `context/documents/` no seu domínio, mas não têm acesso de escrita em `prompts/`. Se uma mudança de regra de negócio exige ajuste no system prompt, a área abre o PR no documento e o time técnico abre um PR separado em `prompts/system/` se necessário.

---

## 7. Fluxo de atualização de um documento de negócio

```
Exemplo: Operations atualiza os multiplicadores de frete (PROC-042-v3)

1. Operations abre PR:
   - Cria PROC-042-v3-frete-especial.md em context/documents/
   - Atualiza metadata.yaml:
       PROC-042-v2: status → deprecated
       PROC-042-v3: status → active, effective_date: "2026-07-01"
   - PR requer aprovação de: @novatech/operations (CODEOWNERS de PROC-*)
                              @novatech/staff-engineers (CODEOWNERS de metadata.yaml)

2. CI roda automaticamente:
   - eval.yml: executa golden set com os novos chunks
   - Verifica se respostas sobre frete ainda passam nos critérios do eval-rubric.md

3. Se evals passam: PR é aprovado e mergeado
   reindex.yml dispara automaticamente: re-indexa PROC-042-v3 no Azure AI Search

4. Tech Lead avalia se o system prompt precisa de ajuste:
   - Neste caso, não precisa (a instrução "cite a fonte e versão" já cobre)
   - Se precisasse, abre PR separado em prompts/system/ com aprovação de Staff Engineer + Compliance
```

---

## 8. Branch protection: configuração recomendada

Configurar na branch `main`:

```
✅ Require a pull request before merging
✅ Require approvals: 1 (mínimo; CODEOWNERS pode exigir mais por path)
✅ Dismiss stale pull request approvals when new commits are pushed
✅ Require review from Code Owners
✅ Require status checks to pass before merging
   - eval / run-golden-set
✅ Require branches to be up to date before merging
✅ Do not allow bypassing the above settings
   (nem admins do repositório podem fazer push direto)
```

---

## 9. Política de versão dos arquivos de prompt

Arquivos em `prompts/system/` seguem versionamento semântico no frontmatter:

| Tipo de mudança | Bump de versão | Exemplos |
|---|---|---|
| Novo comportamento, novo domínio coberto | MAJOR (1.0 → 2.0) | Incluir FAQ como fonte; adicionar domínio de seguro de carga |
| Refinamento de instrução existente | MINOR (1.0 → 1.1) | Melhorar instrução de citação; ajustar formato de saída |
| Correção de ambiguidade, typo, clareza | PATCH (1.0 → 1.0.1) | Corrigir nome de seção, ajustar exemplo |

O histórico de versões é o `git log` — não existe arquivo CHANGELOG separado. O commit message do PR é a documentação da mudança.
