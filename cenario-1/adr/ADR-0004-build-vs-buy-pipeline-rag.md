# ADR-0004: Build vs. Buy para o Pipeline de RAG

## Status: Proposto

**Data:** 2026-06-02
**Autores:** Tech Lead / Arquiteto de Solução
**Revisores:** Desenvolvedor Responsável pelo Pipeline, Gerente de Projeto

---

## Contexto

O projeto da NovaTech exige a construção de um pipeline de RAG (Geração Aumentada por Recuperação) capaz de indexar ~12 milhões de tokens de documentação, atender a 192 consultas RAG por dia, e entregar respostas com citação de fonte dentro de um prazo de 3 meses.

**Características do ambiente existente da NovaTech:**
- Licenças Microsoft 365 E3 para todos os usuários
- Pré-disposição para provisionar Azure AI Services
- Documentação distribuída em SharePoint, Confluence e planilhas de rede
- ~15% dos documentos escaneados (requerem OCR)
- PDFs com tabelas complexas identificados como maior desafio de extração
- Documentos contraditórios em ao menos 3 procedimentos

**Requisitos que impactam a escolha do pipeline:**
- Atualização máxima de 24h após publicação de novo documento
- Respostas devem citar fonte com metadado de origem
- Documentos contraditórios devem exibir ambas as versões com data
- O assistente nunca deve inventar informações

Esta ADR avalia duas abordagens para construção do pipeline de RAG:

- **Opção A (Build):** construir com ferramentas de código aberto — orquestrador LangChain ou LlamaIndex, banco vetorial ChromaDB ou FAISS.
- **Opção B (Buy):** utilizar o ecossistema gerenciado da Microsoft — Azure AI Search (indexação + busca vetorial + reclassificador semântico) com conectores nativos para SharePoint e suporte a OCR via Document Intelligence.

---

## Alternativas Consideradas

### Opção A: Build — LangChain/LlamaIndex + ChromaDB/FAISS

**O que é:**
Construção do pipeline de RAG com orquestradores de código aberto e bancos vetoriais autogerenciados, implantados em infraestrutura Azure (Container Apps, Azure Kubernetes Service ou VM).

**Componentes típicos:**
- LangChain ou LlamaIndex como orquestrador do fluxo RAG
- ChromaDB (banco vetorial leve, autogerenciado) ou FAISS (biblioteca vetorial em memória, sem servidor)
- Conectores customizados para SharePoint, Confluence e planilhas
- OCR via biblioteca open-source (Tesseract) ou serviço externo
- Modelo de embeddings: text-embedding-ada-002 (via Azure OpenAI) ou open-source

---

**Argumentos a favor:**

1. **Controle total sobre o pipeline.** Cada etapa — chunking, embedding, recuperação, reclassificação — é customizável sem depender de abstrações de produto gerenciado. Útil quando requisitos de negócio evoluem de forma imprevisível.

2. **Flexibilidade para adaptar a estratégia de chunking.** PDFs com tabelas complexas e documentos escaneados podem exigir lógica de extração especializada. Com LlamaIndex, é possível criar extratores customizados por tipo de documento sem alterar o restante do pipeline.

3. **Custo de infraestrutura de busca próximo de zero.** ChromaDB e FAISS não cobram por consulta — o custo recai apenas sobre compute e armazenamento, que para 12M tokens são marginais (~1–2 GB de índice).

4. **Independência de fornecedor na camada de recuperação.** A lógica de busca não fica acoplada a um produto da Microsoft. Uma migração futura de provedor de nuvem ou de modelo de embedding não exige reindexação completa com novo serviço gerenciado.

5. **Ecossistema maduro com comunidade ativa.** LangChain e LlamaIndex têm documentação extensa, exemplos de integração com SharePoint e suporte comunitário a casos de uso de RAG empresarial.

---

**Argumentos contra:**

1. **Custo oculto de operação é alto.** ChromaDB e FAISS não têm SLA, monitoramento nativo, backup automático ou suporte enterprise. O time é responsável por disponibilidade, consistência do índice e recuperação de falhas. Em um projeto com prazo de 3 meses e equipe de desenvolvimento de aplicação (não de infraestrutura), esse overhead é subestimado sistematicamente.

2. **Conector com SharePoint é trabalho de integração não-trivial.** O SharePoint tem uma API (Microsoft Graph) complexa, com autenticação OAuth, paginação, lidar com delta (atualizações incrementais) e permissões por biblioteca. Construir um conector confiável que detecte novos documentos em até 24h é uma tarefa de 2–4 semanas de desenvolvimento especializado.

3. **OCR com Tesseract tem qualidade inferior para PDFs de empresa.** Documentos com layouts mistos, tabelas e fontes não-padrão (comuns em PDFs de logística) geram extrações com erros silenciosos. Esses erros contaminam o índice e produzem respostas incorretas sem que o pipeline os detecte.

4. **Reclassificação semântica requer componente adicional.** FAISS e ChromaDB realizam busca por similaridade vetorial pura. Para implementar reclassificação cruzada (cross-encoder reranker) — necessária para perguntas que cruzam múltiplos domínios de documentação (SLA, procedimentos, políticas) — é preciso integrar um modelo de reclassificação separado (ex.: `cross-encoder/ms-marco-MiniLM-L-6-v2`), aumentando a superfície de infraestrutura a operar.

5. **LangChain/LlamaIndex introduzem abstrações que podem dificultar depuração.** Em produção, comportamentos inesperados de recuperação frequentemente são causados por camadas de abstração do orquestrador que escondem o que de fato está sendo enviado ao modelo. Isso aumenta o tempo de diagnóstico de incidentes.

---

### Opção B: Buy — Azure AI Search + Azure OpenAI nativo

**O que é:**
Utilização dos serviços gerenciados da Microsoft para indexação, busca vetorial e reclassificação semântica. O Azure AI Search indexa documentos diretamente do SharePoint via conector nativo (SharePoint Online Indexer), com suporte a extração de texto de PDFs e OCR integrado via Azure Document Intelligence.

**Componentes principais:**
- Azure AI Search (indexação vetorial, busca híbrida, Semantic Ranker)
- Azure Document Intelligence (OCR e extração de tabelas para documentos escaneados)
- SharePoint Online Indexer (conector nativo para atualização incremental)
- Azure OpenAI (embeddings e geração de resposta)
- Azure Monitor + Application Insights (observabilidade)

---

**Argumentos a favor:**

1. **Conector nativo com SharePoint elimina semanas de desenvolvimento.** O SharePoint Online Indexer do Azure AI Search sincroniza documentos automaticamente com suporte a delta (atualizações incrementais), autenticação via identidade gerenciada e rastreamento de permissões. A janela de atualização de 24h exigida pelo Product Specialist é atingível sem código customizado.

2. **OCR de qualidade enterprise via Document Intelligence.** O Azure Document Intelligence extrai texto de PDFs escaneados e tabelas complexas com qualidade significativamente superior ao Tesseract, incluindo preservação de estrutura de tabelas — o maior desafio de extração identificado pelo desenvolvedor.

3. **Semantic Ranker integrado resolve o caso multi-domínio.** O Azure AI Search oferece reclassificação semântica nativa (cross-encoder) sem necessidade de um componente extra. Consultas que cruzam múltiplos domínios de documentação — um padrão recorrente em logística, onde prazos, políticas de devolução e regras de frete se sobrepõem — exigem reclassificação para garantir diversidade de domínio nos resultados.

4. **SLA de 99,9% com suporte enterprise da Microsoft.** Para um assistente em produção com 45 atendentes, a disponibilidade do índice é crítica. O Azure AI Search tem SLA publicado, suporte L3 da Microsoft e failover gerenciado — sem operação manual de infraestrutura.

5. **Observabilidade integrada sem instrumentação adicional.** Métricas de latência, volume de consultas, cache de resultados e erros de indexação estão disponíveis no Azure Monitor e Application Insights sem desenvolvimento extra — relevante no prazo de 3 meses.

6. **Conformidade com LGPD sem necessidade de contrato adicional.** O processamento ocorre dentro da infraestrutura Azure da NovaTech, sob o DPA Microsoft existente via M365 E3. Não há dado de cliente saindo do ambiente da empresa para serviço externo.

---

**Argumentos contra:**

1. **Custo operacional é significativamente maior que o open-source.** O Azure AI Search tem custo baseado em unidades de busca (Search Units). Para o índice da NovaTech (~12M tokens, ~50k documentos estimados):
   - Camada Basic: ~$75/mês (limite de 2GB de índice — potencialmente insuficiente)
   - Camada Standard S1: ~$250/mês (15GB, mais adequado)
   - Document Intelligence (OCR para ~15% de documentos): ~$1,50/1.000 páginas
   - Total estimado: **$270–320/mês** apenas para a camada de recuperação

   Comparado ao ChromaDB (custo de storage + compute, estimado em $30–50/mês), a diferença é de 5–8x na camada de busca.

2. **Menor flexibilidade para customização de chunking.** O SharePoint Indexer usa estratégias de segmentação predefinidas. Para documentos com tabelas complexas ou layouts não-padrão, pode ser necessário pré-processar os documentos fora do Indexer e alimentar o índice por API — parcialmente anulando a vantagem do conector nativo.

3. **Acoplamento ao ecossistema Microsoft aumenta o risco de lock-in.** O modelo de dados do Azure AI Search, os conectores e a integração com Document Intelligence são específicos do Azure. Uma migração futura para outro provedor exigiria reindexação completa e reescrita dos conectores.

4. **O Semantic Ranker não é gratuito e adiciona latência.** O reclassificador semântico é cobrado por consulta e adiciona ~100–200ms de latência por busca. Para 192 consultas/dia, o custo adicional é marginal (~$5–10/mês), mas deve ser monitorado se o volume crescer.

5. **Controle sobre a lógica de recuperação é mais limitado.** Ajustes finos na lógica de scoring, deduplicação ou diversidade de domínio precisam ser implementados dentro das APIs do Azure AI Search, que têm menos flexibilidade que um pipeline de código aberto completamente controlado.

---

## Decisão

**Abordagem selecionada: Opção B — Azure AI Search + Azure OpenAI nativo (Buy)**

A decisão converge sobre a análise de quatro fatores críticos para este projeto:

### 1. O conector nativo com SharePoint é o fator determinante para o prazo

O requisito de atualização em até 24h após publicação de novo documento implica um conector incremental com SharePoint que detecte, baixe, processe e reindexe documentos automaticamente. Construir esse conector com a Microsoft Graph API é trabalho de 2–4 semanas de desenvolvimento especializado — em um projeto de 3 meses, isso consome 17–33% do prazo total apenas para um componente de infraestrutura não-diferenciador.

O SharePoint Online Indexer do Azure AI Search resolve esse problema com configuração, não com código. Essa diferença é decisiva dado o cronograma.

### 2. A qualidade do OCR impacta diretamente a qualidade das respostas

Os ~15% de documentos escaneados e os PDFs com tabelas complexas são riscos de qualidade identificados pelo desenvolvedor. Erros de OCR contaminam o índice silenciosamente — o pipeline não sabe que o texto extraído está incorreto, e as respostas geradas pelo assistente parecerão plausíveis mas serão incorretas.

O Azure Document Intelligence tem qualidade comprovada em extração de tabelas e layouts mistos, significativamente superior ao Tesseract. A diferença de qualidade nesse componente tem impacto direto no requisito "o assistente nunca deve inventar informações".

### 3. O custo adicional é justificável pelo custo de desenvolvimento que substitui

A diferença de custo entre Azure AI Search Standard S1 (~$250/mês) e ChromaDB (~$40/mês) é de ~$210/mês — aproximadamente $2.520/ano. Construir e manter o conector SharePoint, o pipeline de OCR com qualidade adequada e o reclassificador semântico manualmente representa semanas de desenvolvimento e manutenção contínua que excedem esse valor em custo de engenharia.

Em projetos de produto interno com equipe de desenvolvimento de aplicação (não de plataforma), o custo de "buy" é frequentemente menor que o custo total de "build" quando se inclui manutenção.

### 4. O reclassificador semântico é necessário e o serviço gerenciado o entrega sem custo adicional de operação

A documentação da NovaTech abrange múltiplos domínios (SLA, procedimentos operacionais, políticas de compliance) e os atendentes frequentemente fazem perguntas que cruzam esses domínios. Uma busca por similaridade vetorial pura tende a retornar trechos do domínio mais similar à pergunta, ignorando domínios secundários igualmente relevantes. Reclassificação cruzada (cross-encoder reranker) é necessária para garantir que os resultados cubram todos os domínios pertinentes à consulta.

Com a Opção A, o time precisaria integrar, implantar e operar um modelo de reclassificação separado — mais um componente de infraestrutura sem SLA. O Azure AI Search entrega esse componente como parte do serviço, sem operação adicional.

> Esta decisão deve ser revisada se o volume de documentos superar 50.000 páginas ou se o custo do Azure AI Search exceder $500/mês, tornando o investimento em um pipeline open-source economicamente justificável.

---

## Consequências

**Positivas:**
- Conector nativo com SharePoint atende o requisito de atualização em 24h sem desenvolvimento customizado.
- OCR enterprise via Document Intelligence reduz erros de extração em documentos escaneados e PDFs com tabelas.
- Semantic Ranker integrado suporta recuperação multi-domínio sem componentes adicionais a operar.
- SLA de 99,9% com suporte Microsoft adequado para uso em produção com 45 atendentes.
- Observabilidade nativa via Azure Monitor sem instrumentação adicional.
- Processamento dentro do ambiente Azure da NovaTech, compatível com LGPD e DPA Microsoft existente.

**Negativas e riscos:**
- **Custo de infraestrutura de busca de $270–320/mês**, contra ~$40/mês de uma solução open-source. Deve ser aprovado pelo gestor do projeto antes do início do desenvolvimento.
- **Lock-in na camada de recuperação:** a lógica de indexação, busca e reclassificação fica acoplada ao Azure AI Search. Migração futura para outro serviço exige reindexação completa.
- **Flexibilidade de chunking limitada pelo Indexer:** documentos com layouts muito não-padrão podem exigir pré-processamento fora do pipeline gerenciado, parcialmente anulando a vantagem de integração nativa.
- **Dependência da Microsoft para disponibilidade e evolução do produto:** mudanças de preço, depreciação de funcionalidades ou alterações na API do Indexer afetam o pipeline sem controle do time.
- **O Confluence e as planilhas de rede não têm conector nativo no Azure AI Search.** Para essas fontes, será necessário desenvolver conectores customizados ou usar Azure Data Factory — reduzindo o benefício de integração nativa para ~65% do acervo (SharePoint).

**Condições para revisão desta decisão:**
1. Volume de documentos ultrapassar 50.000 páginas, elevando o custo do Azure AI Search para a camada Standard S2 ou superior.
2. Requisitos de customização do pipeline de chunking (por exemplo, extração especializada de tabelas por tipo de documento) que o Azure AI Search não suporte nas suas APIs.
3. A NovaTech decidir migrar a documentação do SharePoint para outra plataforma, removendo a principal vantagem do conector nativo.
4. Custo mensal total do Azure AI Search superar $500/mês, tornando o build economicamente competitivo considerando o custo de desenvolvimento.

---

## Apêndice: Comparativo de Custo Total de Operação (12 meses)

| Componente | Opção A (Build) | Opção B (Buy) |
|---|---|---|
| Banco vetorial (busca) | ~$40/mês (compute + storage) | ~$250/mês (Azure AI Search S1) |
| OCR para documentos escaneados | ~$0 (Tesseract, open-source) | ~$15/mês (Document Intelligence, estimativa) |
| Reclassificador semântico | ~$10/mês (compute para cross-encoder) | Incluído no Azure AI Search |
| Desenvolvimento do conector SharePoint | **H_build** horas × taxa horária | **H_buy** horas × taxa horária |
| Manutenção contínua do pipeline | ~4–8h/mês de engenharia | ~1–2h/mês de configuração |
| **Custo operacional mensal (infraestrutura)** | **~$50/mês** | **~$270/mês** |

*Os custos de desenvolvimento são parametrizados abaixo porque o contrato DB1/NovaTech não foi fornecido para esta análise. Substitua a taxa horária real antes de usar este comparativo para decisão.*

---

### Premissas de esforço de desenvolvimento

| Atividade | Opção A (Build) | Opção B (Buy) |
|---|---|---|
| Conector SharePoint (Microsoft Graph: OAuth, delta, permissões) | 80–120h | 8–16h (configuração do Indexer) |
| Pipeline de OCR (integração + testes com PDFs da NovaTech) | 24–40h | 0h (Document Intelligence nativo) |
| Reclassificador semântico (implantação + integração) | 16–24h | 0h (Semantic Ranker nativo) |
| **Total de desenvolvimento adicional** | **H_build = 120–184h** | **H_buy = 8–16h** |

*Estas estimativas de horas representam esforço de um engenheiro pleno com familiaridade com APIs Microsoft. Não incluem testes de carga, documentação ou onboarding — que são equivalentes entre as opções.*

---

### Cálculo do threshold: a partir de qual taxa horária o Build se torna inviável?

O Buy tem custo de infraestrutura maior ($270/mês vs. $50/mês), mas custo de desenvolvimento menor. O threshold é a taxa horária na qual o custo total de 2 anos (desenvolvimento + infraestrutura) se iguala entre as opções.

**Variáveis:**
- `T` = taxa horária de engenharia (R$/h) — **valor a preencher com o contrato real**
- Horizonte de análise: 24 meses
- Câmbio de referência: R$5,70/USD (ajustar conforme data de assinatura do contrato)

**Custo total em 24 meses:**

```
Custo_Build  = H_build × T  +  ($50/mês  × 24 × R$5,70)  +  (5h/mês × 24 × T)
Custo_Buy    = H_buy   × T  +  ($270/mês × 24 × R$5,70)  +  (1,5h/mês × 24 × T)
```

Simplificando com os valores centrais (H_build = 152h, H_buy = 12h, manutenção Build = 6h/mês, manutenção Buy = 1,5h/mês):

```
Custo_Build  = 152T  +  6.840  +  144T   =  296T  +  6.840
Custo_Buy    = 12T   +  36.936 +  36T    =   48T  +  36.936
```

**Ponto de indiferença (Custo_Build = Custo_Buy):**

```
296T + 6.840 = 48T + 36.936
248T = 30.096
T* ≈ R$ 121/h
```

**Interpretação:**

| Taxa horária contratada | Decisão favorecida |
|---|---|
| T < R$121/h | Build é mais barato no horizonte de 2 anos |
| T = R$121/h | Indiferente (TCO equivalente) |
| T > R$121/h | **Buy é mais barato** — cada hora economizada vale mais que a diferença de infraestrutura |

---

## Apêndice: Cobertura dos Conectores por Fonte de Documentação

| Fonte | Opção A (Build) | Opção B (Buy — Azure AI Search) |
|---|---|---|
| SharePoint (~800 docs) | Conector customizado via Microsoft Graph (2–4 semanas) | Conector nativo (SharePoint Online Indexer) |
| Confluence (~400 páginas) | Conector customizado via API REST Confluence | Conector customizado via API REST Confluence |
| Planilhas de rede (~N planilhas) | Leitor de arquivo customizado | Azure Data Factory ou leitor customizado |

*Nenhuma das duas opções resolve nativamente a integração com Confluence e planilhas de rede — ambas exigem desenvolvimento customizado para essas fontes. A vantagem da Opção B concentra-se integralmente no SharePoint, que representa a maior fonte individual (~65% dos documentos).*
