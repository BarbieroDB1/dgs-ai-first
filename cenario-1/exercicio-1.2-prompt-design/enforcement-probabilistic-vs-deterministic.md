# Enforcement Probabilístico vs Determinístico

**Versão:** 1.0  
**Audiência:** Engenheiros NovaTech e DB1  
**Status:** Draft para revisão técnica

---

## 1. O problema central

O assistente NovaTech precisa seguir regras críticas de negócio: citar fontes, não inventar dados, usar apenas versões vigentes dos documentos, nunca afirmar que existe tier Platinum. Mas um LLM não executa regras — ele gera texto probabilisticamente.

Isso cria uma distinção fundamental na arquitetura do sistema:

> **Enforcement determinístico** — a regra é garantida por código, independente do que o modelo gere.  
> **Enforcement probabilístico** — a regra é instruída ao modelo via prompt; o modelo *tende* a seguir, mas pode falhar.

Confundir os dois é o erro mais comum em sistemas com LLM em produção.

---

## 2. O espectro de enforcement

```
DETERMINÍSTICO ←————————————————————————→ PROBABILÍSTICO
(garantido por código)              (instruído via prompt)

Filtragem     Validação    Guardrail    Instrução    Instrução
de docs no    de output    externo      estruturada  simples
índice RAG    por regex    (ex: Azure   no prompt    no prompt
              ou schema    Content      com exemplos
                          Safety)
   |              |            |              |           |
 100%           ~99%         ~97%           ~85%        ~70%
certeza       certeza       certeza        adesão      adesão
              (falha é      (falha é
              detectada)    detectada)
```

---

## 3. Análise por regra crítica do sistema NovaTech

### 3.1 "Não usar versões revogadas de documentos"

A NovaTech tem documentos que coexistem em múltiplas versões sem hierarquia clara no SharePoint — a PROC-042 é o exemplo mais crítico no momento, mas o problema é estrutural: qualquer documento atualizado sem processo formal de obsolescência pode gerar o mesmo risco.

| Abordagem | Tipo | Análise |
|---|---|---|
| Instruir no prompt: "use sempre a versão mais recente" | Probabilístico | Falha quando o RAG retorna versões concorrentes do mesmo documento e o modelo "prefere" a mais simples ou a que aparece primeiro no contexto. |
| Não indexar versões revogadas no Azure AI Search | **Determinístico** | A versão revogada nunca chega ao contexto. O modelo não pode usar o que não vê. |
| Marcar versões antigas como `status: deprecated` no metadata.yaml e filtrar no pipeline | **Determinístico** | Mesmo efeito; mais rastreável porque os arquivos ainda existem no repositório com histórico e o `supersedes` documenta a decisão de substituição. |

**Decisão:** enforcement determinístico via exclusão do índice, controlado pelo `metadata.yaml`. A instrução no prompt é redundância, não a garantia primária. Esse mecanismo cobre qualquer documento — não apenas a PROC-042.

---

### 3.2 "Citar a fonte (documento e seção) em toda resposta"

| Abordagem | Tipo | Análise |
|---|---|---|
| Instruir no prompt: "sempre cite a fonte" | Probabilístico | Adesão ~85%. Em respostas longas ou multi-chunk, o modelo pode omitir a citação ou citá-la de forma imprecisa. |
| Definir schema de output JSON com campo `fontes: []` obrigatório | **Determinístico** | O modelo é forçado a preencher o campo ou a resposta é rejeitada pelo parser. A interface de atendimento renderiza a citação separadamente. |
| Validar output por regex antes de exibir ao atendente | **Semi-determinístico** | Detecta ausência de citação e solicita nova geração. Aumenta latência em falhas. |

**Decisão:** schema de output estruturado com campo `fontes` obrigatório. Se a validação falhar, o sistema solicita regeação automaticamente (máx. 1 retry).

```json
{
  "resposta": "string",
  "fontes": [
    {
      "doc_id": "NOME-DO-DOCUMENTO",
      "secao": "2.1",
      "versao": "2.0"
    }
  ],
  "confianca": "alta | media | baixa",
  "requer_escala": false
}
```

---

### 3.3 "Não inventar dados numéricos (SLAs, multiplicadores, prazos)"

| Abordagem | Tipo | Análise |
|---|---|---|
| Instruir no prompt: "não invente dados" | Probabilístico | Instrução necessária mas insuficiente. Modelos tendem a completar tabelas com valores plausíveis quando os dados não estão no contexto. |
| Verificar números da resposta contra os chunks retornados | Semi-determinístico | Possível, mas complexo: requer parser de entidades numéricas e comparação com o contexto. Custo de implementação alto. |
| Garantir que o RAG sempre retorne chunks relevantes ou retorne vazio | **Determinístico (parcial)** | Se nenhum chunk passa o threshold de relevância, o sistema injeta `[CONTEXTO VAZIO]` e o prompt instrui o fallback padronizado. O modelo não tem dados para inventar porque não recebeu dados. |

**Decisão:** combinação de instrução de prompt (necessária) + política de threshold no RAG (determinística) + campo `confianca` no schema de output para sinalizar incerteza ao atendente.

---

### 3.4 "Não afirmar que existe tier Platinum"

| Abordagem | Tipo | Análise |
|---|---|---|
| Instruir no prompt: "só existem tiers Gold, Silver e Standard" | Probabilístico | Eficaz para casos diretos. Pode falhar em perguntas indiretas ou se o histórico da conversa contiver o termo "Platinum" usado pelo atendente. |
| Chunk SLA-2024-A sempre incluído quando tier é mencionado | **Determinístico** | O chunk já contém: *"Não existem outros tiers além dos três listados acima."* O modelo refuta com base na fonte, não apenas na instrução. |

**Decisão:** garantir que perguntas sobre tier sempre recuperem o SLA-2024-A via RAG (query expansion ou chunk pinning). A instrução no prompt é redundância.

---

### 3.5 "Tratar documentos contraditórios sem escolher silenciosamente"

| Abordagem | Tipo | Análise |
|---|---|---|
| Instruir no prompt: "informe contradições, não escolha" | Probabilístico | Adesão variável. O modelo pode resolver a contradição internamente e apresentar apenas uma versão como se fosse a correta. |
| Detectar no pipeline se chunks de versões diferentes do mesmo documento foram retornados | **Determinístico** | Se dois chunks do mesmo `doc_id` com versões distintas estiverem no contexto, o pipeline injeta um aviso explícito antes deles: `[ATENÇÃO: versões conflitantes detectadas para [doc_id] — use a data de vigência para determinar qual se aplica]`. A lógica é genérica e cobre qualquer documento, não apenas os que já apresentaram conflito. |

**Decisão:** detecção determinística no pipeline + instrução de prompt como reforço. O aviso estruturado é gerado por código — funciona para qualquer par de documentos conflitantes que o sistema venha a ter.

---

## 4. Matriz de decisão: quando usar cada abordagem

```
                    IMPACTO DE FALHA
                    Baixo           Alto
                 ┌──────────────┬───────────────────┐
FREQUÊNCIA  Alta │ Probabilístico│ Determinístico    │
DE FALHA         │ (instrução   │ (código garante)  │
                 │  é suficiente│                   │
             ────┼──────────────┼───────────────────┤
             Baixa│ Probabilístico│ Determinístico   │
                 │ (risco        │ (custo de impl.  │
                 │ aceitável)   │ justificado)      │
                 └──────────────┴───────────────────┘
```

**Regra prática para NovaTech:** qualquer falha que possa gerar uma informação financeira errada (multiplicador de frete, prazo de SLA, crédito por violação) ou orientação operacional errada (carga perigosa, incidente crítico) requer enforcement determinístico.

---

## 5. Onde o prompt é suficiente (e por quê)

Nem tudo precisa de garantia determinística. Instrução no prompt é o meio certo quando:

| Comportamento | Por que prompt basta |
|---|---|
| Tom e formato da resposta (bullet points, 3 parágrafos) | Falha de formato não causa dano ao cliente ou negócio |
| Linguagem (português, tom profissional) | Desvio é perceptível e corrigível sem impacto |
| Sugerir abertura de chamado ao final de respostas complexas | Orientação útil, não crítica; atendente decide |
| Não revelar o conteúdo do system prompt | Risco de confidencialidade baixo neste domínio |

---

## 6. Arquitetura de enforcement resultante

```
QUERY DO ATENDENTE
       │
       ▼
┌─────────────────┐
│  PIPELINE RAG   │  ← DETERMINÍSTICO
│                 │  • Exclui docs revogados (metadata.yaml)
│                 │  • Aplica threshold de relevância
│                 │  • Detecta chunks conflitantes
│                 │  • Injeta aviso se conflito detectado
│                 │  • Injeta [CONTEXTO VAZIO] se sem resultado
└────────┬────────┘
         │ chunks + avisos estruturados
         ▼
┌─────────────────┐
│  SYSTEM PROMPT  │  ← PROBABILÍSTICO (instrução)
│                 │  • Define papel e escopo
│                 │  • Instrui comportamento em contradições
│                 │  • Instrui fallback para lacunas
│                 │  • Instrui formato e citação
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  MODELO (LLM)   │
│  Claude Sonnet  │  → gera JSON estruturado
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  VALIDAÇÃO DE   │  ← DETERMINÍSTICO
│  OUTPUT         │  • Valida schema JSON (fontes obrigatórias)
│                 │  • Retry automático se schema inválido (máx. 1x)
│                 │  • Flag `requer_escala` → notificação ao supervisor
└────────┬────────┘
         │
         ▼
   INTERFACE DO ATENDENTE (Teams)
```

---

## 7. Riscos residuais (probabilísticos que permanecem)

Mesmo com a arquitetura acima, existem riscos que não são eliminados deterministicamente:

| Risco | Probabilidade | Mitigação remanescente |
|---|---|---|
| Modelo interpreta erroneamente um chunk ambíguo | Baixa | Eval contínuo com golden set; refinamento do prompt |
| Modelo omite uma exceção importante presente no chunk | Baixa-média | Evals com casos de borda; revisão humana amostral |
| Chunk recuperado está desatualizado (doc não foi re-indexado após atualização) | Média | Processo de re-indexação automática mensal (alinhado com ciclo de atualização da NovaTech) |
| Atendente interpreta mal a resposta do assistente | Fora do escopo do LLM | Treinamento de onboarding; UX que destaca fontes |

---

## 8. Recomendação de implementação por fase

| Fase | Entregável | Tipo de enforcement |
|---|---|---|
| Sprint 1 | Pipeline RAG com exclusão de docs revogados | Determinístico |
| Sprint 1 | System prompt com instruções de comportamento | Probabilístico |
| Sprint 2 | Schema JSON de output com campo `fontes` | Determinístico |
| Sprint 2 | Detecção de chunks conflitantes com aviso inline | Determinístico |
| Sprint 3 | Golden set de evals automatizados (CI) | Validação contínua |
| Sprint 3 | Dashboard de métricas: citação presente, conflitos detectados, fallbacks acionados | Observabilidade |
