# ADR-0003: Tratamento de Documentos Contraditórios no Pipeline RAG

## Status: Proposto

**Data:** 2026-06-02
**Autores:** Tech Lead / Arquiteto de Solução
**Revisores:** Product Specialist, Desenvolvedor Responsável pelo Pipeline

---

## Contexto

A base documental da NovaTech contém versões conflitantes de ao menos 3 procedimentos identificados. O caso mais documentado é PROC-042: a versão v1 (mar/2023) e a v2 (nov/2023) divergem em multiplicadores regionais, fatores de peso e prazo adicional de entrega. Nenhuma das versões possui marcação formal de obsolescência no SharePoint. O FAQ-Atendimento (Item 8) orienta o uso da v2 por padrão, mas não é um documento normativo.

O requisito do Product Specialist é explícito: **o assistente deve exibir ambas as versões com indicação de data e nunca escolher silenciosamente qual aplicar.**

O pipeline precisa de uma política determinística para responder: quando o sistema de recuperação retorna versões conflitantes do mesmo procedimento, o que o assistente faz?

As três abordagens viáveis são:

1. **Manter apenas a versão mais recente** — descartar versões antigas no momento da indexação ou da recuperação.
2. **Manter ambas as versões com metadado de vigência** — indexar todas as versões, sinalizar a contradição em tempo de execução e apresentá-las ao usuário com suas respectivas datas.
3. **Delegar a decisão ao LLM com instrução no prompt** — incluir ambas as versões no contexto e instruir o modelo a decidir qual apresentar ou como conciliar o conflito.

---

## Decisão

**Manter ambas as versões com metadado de vigência, com detecção de contradição no orquestrador e apresentação explícita ao usuário.**

### Metadados obrigatórios no índice

Cada trecho indexado no Azure AI Search deve carregar os seguintes campos:

| Campo | Tipo | Descrição |
|---|---|---|
| `document_version` | string | Ex.: "1.0", "2.0" |
| `document_date` | date | Data de publicação do documento |
| `document_status` | enum | `vigente` / `obsoleto` / `sem_status` |
| `document_authority` | enum | `normativo` / `informal` |
| `procedure_id` | string | Ex.: "PROC-042" — vincula versões do mesmo procedimento |

### Lógica de detecção no orquestrador

Quando o sistema de recuperação retornar trechos com o mesmo `procedure_id` e `document_version` distintos, o orquestrador deve:

1. Montar o contexto com flag explícito de contradição.
2. Ativar o template de prompt de contradição em vez do template padrão.
3. Incluir ambas as versões com seus respectivos `document_date` e `document_status`.

### Template de prompt para contradição

O *system prompt* deve instruir o modelo com o seguinte padrão:

> "Foram encontradas duas versões deste procedimento. Apresente o conteúdo de cada versão separadamente, identificando a data de publicação de cada uma. Informe ao usuário que deve verificar com o responsável pela área qual versão está em vigor para o seu caso. Não escolha entre as versões."

### Escopo de acionamento

Este fluxo é ativado quando o `procedure_id` é idêntico e `document_version` difere. Os casos conhecidos que acionam este fluxo são:

- PROC-042 v1 vs. PROC-042 v2 (multiplicadores regionais, fatores de peso e prazo adicional de entrega)
- Qualquer procedimento futuro com múltiplas versões ativas sem marcação formal de obsolescência

Documentos de natureza diferente (ex.: FAQ divergindo de documento normativo) **não acionam este fluxo**. Esses casos são tratados pelo campo `document_authority` — o modelo sinaliza a fonte informal, mas não precisa apresentar "ambas as versões" porque são documentos de natureza distinta.

---

## Consequências

**Positivas:**

- Atende diretamente ao requisito do Product Specialist: ambas as versões são exibidas com data, e o modelo nunca escolhe silenciosamente.
- A lógica de detecção é determinística (baseada em metadados), não dependente do julgamento do LLM — comportamento previsível e testável.
- Versões antigas permanecem auditáveis: é possível responder perguntas sobre o que o procedimento dizia em uma data específica.
- O modelo não precisa de capacidade de raciocínio sobre qual versão é "mais correta" — uma tarefa para a qual não foi treinado no domínio da NovaTech.

**Negativas e riscos:**

- **Complexidade de indexação e manutenção de metadados.** A marcação de `document_status` e `procedure_id` deve ser feita no momento da ingestão. Se um novo documento for publicado sem marcação correta, o fluxo de detecção pode não ser acionado, ou pode ser acionado erroneamente.
- **O usuário recebe ambas as versões e precisa decidir qual aplicar.** Para atendentes menos experientes, isso pode ser desorientador — o assistente transfere a responsabilidade de decisão para quem fez a pergunta, em vez de resolver o problema.
- **Custo de tokens mais alto em fluxos de contradição.** Apresentar duas versões completas de um procedimento pode dobrar o tamanho da resposta e do contexto para esses casos.
- **Documentos sem `procedure_id` padronizado não são detectados.** Contradições entre documentos de nomes diferentes que tratam do mesmo tema não são capturadas por esta lógica.
- **A fronteira entre "contradição" e "complementação" não é trivial.** Duas seções de documentos diferentes que divergem em um ponto específico podem ou não constituir uma contradição real — a lógica de `procedure_id` resolve apenas o caso de versões explícitas do mesmo documento.

**Condições para revisão desta decisão:**

1. Levantamento identificar que mais de 20% dos documentos da base não possuem identificador de procedimento padronizado no SharePoint, tornando a detecção por `procedure_id` ineficaz para a maioria dos conflitos reais.
2. Retorno dos atendentes indicar que a apresentação de ambas as versões sem recomendação gera mais confusão do que a ausência de informação.
3. A NovaTech estabelecer processo formal de marcação de obsolescência de documentos no SharePoint, tornando desnecessária a detecção automática de contradição.

---

## Alternativas Consideradas

### Alternativa A: Manter apenas a versão mais recente

Ao indexar ou recuperar documentos, descartar versões mais antigas do mesmo procedimento. Apenas a versão com `document_date` mais recente é incluída no índice ativo.

**A favor:**
- Implementação mais simples: sem lógica de detecção de contradição, sem template alternativo de prompt.
- O usuário recebe uma resposta direta, sem precisar escolher entre versões.
- Elimina o risco de o atendente aplicar uma versão obsoleta por equívoco.

**Contra:**
- **Viola o requisito explícito do Product Specialist.** A especificação determina que documentos contraditórios devem mostrar ambas as versões com indicação de data. Implementar esta alternativa requer revisão formal do requisito, não apenas uma decisão técnica.
- **"Mais recente" não é necessariamente "vigente".** A v2 do PROC-042 não possui marcação formal de aprovação. Se a v1 for a versão normativa ainda em vigor e a v2 for um rascunho publicado por engano, descartar a v1 gera erro operacional silencioso.
- **Perde a capacidade de auditoria histórica.** Perguntas como "qual era o multiplicador regional em março de 2023?" não poderão ser respondidas.
- **O risco de errar a escolha da versão "correta" é transferido para o pipeline.** Sem validação humana de qual versão está de fato vigente, o sistema assume uma responsabilidade que não tem base para exercer.

**Por que descartada:** viola requisito explícito e assume responsabilidade de decisão sem base formal de vigência.

---

### Alternativa B: Delegar a decisão ao LLM com instrução no prompt

Incluir ambas as versões no contexto e instruir o LLM, via *system prompt*, a identificar a versão mais provável de estar vigente (pela data, pelo conteúdo ou por sinais implícitos) e apresentar essa versão ao usuário com uma ressalva.

**A favor:**
- O usuário recebe uma resposta mais direta — o assistente "recomenda" uma versão em vez de transferir a decisão.
- Em casos onde a versão mais recente é claramente a correta (ex.: data de publicação recente, linguagem de atualização explícita), o modelo pode capturar esse sinal sem lógica adicional no pipeline.
- Não exige implementação de metadados estruturados no índice para funcionar.

**Contra:**
- **Viola o requisito "o assistente nunca deve inventar informações".** Inferir vigência a partir do conteúdo do documento é raciocínio especulativo. O LLM não tem acesso ao processo de aprovação, ao histórico de publicação nem à política interna da NovaTech — e pode produzir uma recomendação confiante mas incorreta.
- **O comportamento não é determinístico.** A mesma pergunta com as mesmas duas versões pode produzir recomendações diferentes em execuções distintas, dependendo de temperatura e variações de geração. Isso é inaceitável em contexto operacional.
- **A responsabilidade legal de escolher a versão vigente é do responsável pelo procedimento, não do assistente.** Um atendente que aplica a versão "recomendada pelo assistente" e causa erro operacional pode gerar disputa sobre responsabilidade.
- **Custo de raciocínio:** instrução de resolução de contradição no prompt aumenta a complexidade e o tamanho do *system prompt*, com impacto em latência e custo por consulta.

**Por que descartada:** comportamento não determinístico em decisão com impacto operacional real, e violação do requisito de não inventar informações.
