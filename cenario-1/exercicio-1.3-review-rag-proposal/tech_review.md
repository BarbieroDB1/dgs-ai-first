# Revisão técnica de uma proposta

## Proposta da arquitetura RAG

> Vamos usar Azure AI Search com embeddings do ada-002. Todos os documentos serão indexados num único índice. Chunking fixo de 512 tokens sem overlap. O LLM recebe os 3 chunks mais similares. Usaremos GPT-4o para geração. O pipeline de ingestão roda manualmente quando alguém lembra de atualizar.

## Análise (humana)

- [Ada-002](https://developers.openai.com/api/docs/models/compare?model=text-embedding-ada-002) é um modelo que equilibra custo e velocidade comparado aos outros modelos próprios para embedding; pode ser um bom ponto de partida mas ele não é suficiente: ainda temos que ter modelos com suporte a OCR (ou criarmos um pré-processamento de todos os arquivos que precisam de OCR). o modelos `text-embedding-3-small` provavelmente tem melhor custo benefício para arquivos pequenos, então talvez seja melhor rever se o ada-002 é o melhor.
- Índice único vai causar problemas dado que existem muitos documentos de tipos diferentes e informações diferentes.
- Chunking fixo de 512 tokens parece exagerado para boa parte dos documentos. Chunkings variáveis provavelmente são mais eficientes. Segundo a [doc da Azure](https://learn.microsoft.com/en-us/azure/search/cognitive-search-skill-azure-openai-embedding), os modelos 3-small e 3-large suportam chunks variáveis(a dimensão do ada-002 é "1536", fixo, mas não está claro se essa dimensão é número de tokens ou outra coisa)
- Chunks de apenas similaridade sem considerar os assuntos vão causar problemas em perguntas de múltiplos assuntos, e 3 chunks parece muito pequeno para esse cenário. Temos espaço para isso, não precisamos nos limitar tanto.
- GPT-4o já foi superado pelo GPT-5 em [basicamente todas as métricas](https://developers.openai.com/api/docs/models/compare); se precisarmos de Fine tuning(que o GPT-5+ não possuem), o GPT-4.1 suporta essa funcionalidade sendo ainda superior em todas as outras métricas.
- Um pipeline que roda manualmente é frágil, principalmente para o contexto da NovaTech. Pode ser útil para um proof of concept, mas em produção pecisaremos de uma forma automatizada de executar o pipeline de ingestão. Num caso extremo, devemos definir um processo obrigatório em que alguém executa esse pipeline periodicamente, com alertas críticos - nunca quando "alguém lembrar".

---

## Análise (Claude)

A proposta tem uma base tecnológica razoável (Azure AI Search + GPT-4o faz sentido dado o ambiente Microsoft da NovaTech), mas apresenta **problemas significativos**:

---

### 1. Chunking fixo de 512 tokens sem overlap

**Problema:** Chunks fixos cortam informação no meio de frases, parágrafos ou seções lógicas. Sem overlap, o contexto nas fronteiras entre chunks se perde completamente. Um procedimento de 6 passos pode ser dividido em dois chunks onde nenhum deles faz sentido sozinho.

**Recomendação:** Usar chunking semântico (por seção/parágrafo) com overlap de 10-20% para preservar contexto nas bordas.

---

### 2. Índice único para todos os documentos

**Problema:** A NovaTech tem ~1.200 documentos de naturezas muito diferentes (políticas de compliance, tabelas de SLA, regras de frete, FAQs). Um índice único sem segmentação dificulta o retrieval preciso — uma pergunta sobre SLA pode retornar chunks de políticas de compliance que mencionam "prazo" em outro contexto.

**Recomendação:** Usar metadados ricos (tipo de documento, área, data de atualização, versão) como filtros no índice, ou considerar índices separados por domínio com roteamento de queries.

---

### 3. Apenas 3 chunks recuperados (top-k = 3)

**Problema:** Para perguntas que exigem cruzamento de informações (ex: "qual o SLA para cliente Gold com frete expresso na região Sul?"), 3 chunks podem ser insuficientes. Além disso, com documentos que se contradizem entre versões, é essencial trazer múltiplas versões para que o LLM possa identificar qual é a mais recente.

**Recomendação:** Top-k dinâmico baseado na complexidade da query, ou um valor mais alto (5-10) com reranking para selecionar os mais relevantes.

---

### 4. Pipeline de ingestão manual ("quando alguém lembra")

**Problema crítico:** A documentação é atualizada mensalmente por 3 áreas diferentes. Um pipeline manual significa que o assistente vai responder com informações desatualizadas — exatamente o problema que a NovaTech já tem hoje. Isso compromete a confiança no sistema e pode gerar respostas erradas.

**Recomendação:** Pipeline automatizado com triggers (webhook no SharePoint, monitoramento de alterações no Confluence, watch na pasta de rede) e processamento incremental. No mínimo, agendamento diário/semanal.

---

### 5. Sem estratégia para documentos contraditórios/versionados

**Problema:** O cenário explicita que "alguns documentos se contradizem entre versões". A proposta não endereça como lidar com isso. Sem controle de versão nos metadados e lógica de priorização, o LLM pode citar uma política revogada como se fosse vigente.

**Recomendação:** Metadados de versão e data de vigência em cada chunk, com instrução no system prompt para priorizar a versão mais recente e sinalizar conflitos.

---

### 6. Sem menção a rastreabilidade de fontes

**Problema:** O requisito da NovaTech inclui "indicação da fonte". A proposta não detalha como os chunks manterão referência ao documento original (título, seção, página) para citação na resposta.

---

### 7. Sem métricas ou avaliação

**Problema:** Não há menção a como medir se o sistema está funcionando (relevância do retrieval, acurácia das respostas, cobertura). Sem isso, não há como saber se a meta de "12 → 2 minutos" está sendo atingida.

---

### Resumo

| Aspecto | Risco |
|---------|-------|
| Chunking fixo sem overlap | Perda de contexto, respostas incompletas |
| Índice único | Retrieval impreciso em domínios distintos |
| Top-k = 3 fixo | Insuficiente para perguntas complexas |
| Ingestão manual | Dados desatualizados (problema central) |
| Sem versionamento | Respostas baseadas em docs revogados |
| Sem citação de fontes | Não atende requisito do cliente |
| Sem avaliação | Impossível medir sucesso |

A proposta é um ponto de partida, mas precisa de revisão significativa antes de ir para implementação.


---

## Alternativas propostas

### Modelo de embedding (problema humano)

**Ada-002** tem dimensão fixa de 1536 e não processa imagens/PDFs escaneados nativamente.

**Alternativa:** Usar `text-embedding-3-small` como padrão (melhor custo-benefício, dimensão configurável). Para documentos com imagens ou PDFs escaneados, adicionar uma etapa de pré-processamento com OCR (ex: Azure Document Intelligence) antes de passar o texto para embedding. Reavaliar para `text-embedding-3-large` apenas se a qualidade de retrieval for insuficiente após testes.

---

### Modelo de chat (problema humano)

**GPT-4o** foi superado em métricas gerais.

**Alternativa:** Usar **GPT-4.1** como modelo principal — é superior ao GPT-4o em benchmarks e suporta fine-tuning caso necessário no futuro. Evitar GPT-5 por ora: sem suporte a fine-tuning e custo mais elevado sem ganho comprovado para este caso de uso.

---

### Índice único (problema humano + Claude)

Documentos heterogêneos num único índice degradam a precisão do retrieval.

**Alternativa:** Usar **um único índice com metadados estruturados** (campo `tipo_documento`: `compliance`, `sla`, `frete`, `faq`; campo `area`; campo `data_vigencia`). Nas queries, aplicar filtros por metadado antes do retrieval semântico. Isso evita a complexidade de múltiplos índices mantendo a separação lógica. Só criar índices separados se os domínios tiverem volumes muito distintos ou SLAs de atualização diferentes.

---

### Chunking fixo sem overlap (problema humano + Claude)

512 tokens fixos cortam contexto; sem overlap perde-se informação nas bordas.

**Alternativa:** Chunking **por unidade semântica** (parágrafo ou seção, com limite máximo de ~400 tokens) com overlap de 15% entre chunks adjacentes. Para documentos estruturados como tabelas de SLA, manter a linha/seção inteira como chunk mínimo, mesmo que menor que o limite.

---

### Top-k fixo em 3 chunks (problema humano + Claude)

3 chunks é insuficiente para perguntas que cruzam múltiplos assuntos ou versões.

**Alternativa:** Aumentar para **top-k = 8** com reranking por relevância antes de passar ao LLM (Azure AI Search já oferece semantic ranker nativo). Isso garante cobertura maior sem sobrecarregar o contexto do modelo — o reranker descarta os menos relevantes antes da geração.

---

### Pipeline de ingestão manual (problema humano + Claude)

Pipeline manual resulta em dados desatualizados, o problema central da NovaTech.

**Alternativa:** Agendamento automático **diário** com processamento incremental (reindexar apenas documentos alterados desde a última execução). Usar hash do conteúdo para detectar mudanças. Para o médio prazo, avaliar webhooks do SharePoint/Confluence. Alertas obrigatórios em caso de falha no pipeline.

---

### Sem versionamento de documentos (problema Claude)

O LLM pode citar versões revogadas como vigentes.

**Alternativa:** Adicionar metadados `versao` e `data_vigencia` em cada chunk na ingestão. No system prompt, instruir o modelo a priorizar o chunk com `data_vigencia` mais recente em caso de conflito, e a sinalizar explicitamente quando encontrar informações contraditórias entre versões.

---

### Sem rastreabilidade de fontes (problema Claude)

O requisito da NovaTech inclui indicação da fonte na resposta.

**Alternativa:** Armazenar `titulo_documento`, `secao` e `pagina` como metadados em cada chunk. No prompt de geração, exigir que o modelo cite a fonte ao final de cada afirmação relevante no formato `[Título do Doc, Seção X]`.

---

### Sem métricas de avaliação (problema Claude)

Sem avaliação não há como saber se o sistema atingiu a meta de 12 → 2 minutos.

**Alternativa:** Definir um conjunto mínimo de métricas antes do go-live: (1) **precisão do retrieval** — percentual de perguntas-teste em que o chunk correto aparece no top-8; (2) **satisfação de resposta** — avaliação manual de uma amostra semanal pelos próprios atendentes; (3) **tempo médio de resposta** — log de latência por query. Não é necessário um sistema de avaliação sofisticado; uma planilha com amostragem semanal já resolve no início.

---

## Comparação (humano vs Claude)

Na análise humana, houve uma verificação de detalhes de implementação (modelo de embedding, modelo de chat) e comparado com o atual do mercado - algo que o Claude provavelmente não tem acesso devido à data de cutoff do seu modelo. 

Ambas as análises identificaram o problema com o índice único e a limitação dos 3 chunks. A análise humana usou outros modelos de embedding como alternativa ao chunk fixo e limitado, e o Claude identificou que a falta de overlap pode causar problemas de contexto.

Ambas as análises foram bem similares quanto ao pipeline de ingestão manual, porém o Claude também pontuou a cadência de atualização de documentos da NovaTech.

O humano não analisou a falta de métricas e nem a rastreabilidade de fontes.

O Claude não identificou que o GPT-4o pode não ser a melhor escolha atualmente.