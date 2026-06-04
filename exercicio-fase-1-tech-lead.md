
#### Exercício 1.1 — Decisões arquiteturais documentadas como ADRs

**Contexto:** Você é o Tech Lead do projeto e precisa tomar e documentar decisões arquiteturais fundamentadas nas capacidades e limitações reais da IA generativa. Cada decisão deve ser registrada como um ADR (Architecture Decision Record) independente.

**Ferramentas a utilizar:** Claude (chat)

**Inputs fornecidos:**
- O cenário completo.
- A análise técnica do desenvolvedor (simulada): *"Base estimada em ~12M tokens. PDFs com tabelas complexas são o maior desafio para extração. Documentos escaneados (~15% da base) precisarão de OCR. Documentos contraditórios foram identificados em ao menos 3 procedimentos. Recomendação de chunking por seção com overlap de 10%."*
- Os requisitos do Product Specialist (simulados): *"Respostas devem citar fonte. Documentos contraditórios devem mostrar ambas as versões com indicação de data. Atualização máxima de 24h após publicação de novo documento. O assistente nunca deve inventar informações."*
- Formato de ADR:
  ```
  # ADR-NNNN: [Título da Decisão]
  ## Status: Proposto / Aceito / Depreciado
  ## Contexto: [Qual problema estamos resolvendo? Que forças atuam?]
  ## Decisão: [O que decidimos fazer?]
  ## Consequências: [O que isso implica — positivo e negativo?]
  ## Alternativas consideradas: [O que mais avaliamos e por que descartamos?]
  ```

**Tarefa:**
Usando o **Claude**, produza 4 ADRs independentes, uma para cada decisão abaixo. Para cada ADR, peça ao Claude que atue como "devil's advocate": apresente a decisão e peça que argumente contra. Use os contra-argumentos para fortalecer ou revisar a decisão.

**ADR-0001 — Escolha do modelo de LLM:** Considerando o ecossistema Microsoft, avalie Azure OpenAI (GPT-4o) vs alternativas (Claude via API, modelos open-source via Ollama). Justifique considerando: custo por token para o volume estimado (320 chamados/dia × 60% com consulta), janela de contexto necessária, o requisito de não alucinar, e integração com o stack Azure.

**ADR-0002 — Estratégia de gerenciamento de contexto:** Como o pipeline gerencia o contexto que o LLM recebe? Defina: tamanho máximo de contexto por query, número de chunks recuperados, estratégia para perguntas multi-domínio (que cruzam SLA + frete + devolução), e como lidar com context rot em conversas longas (o bot no Teams pode ter múltiplas perguntas na mesma sessão).

**ADR-0003 — Tratamento de documentos contraditórios:** Como o pipeline deve tratar duas versões de um mesmo documento? Opções incluem: manter apenas a mais recente, manter ambas com metadado de vigência, ou delegar a decisão ao LLM com instrução no prompt.

**ADR-0004 — Build vs buy para o pipeline de RAG:** Construir com LangChain/LlamaIndex + ChromaDB/FAISS (open-source, mais controle) vs usar Azure AI Search + Azure OpenAI nativo (managed, menos controle, mais integrado). Considere: custo, complexidade operacional, flexibilidade, e o fato de que a NovaTech já tem Azure.

**Entregável:** Os 4 ADRs completos no formato especificado e o histórico de "devil's advocate" com o Claude para ao menos 2 das 4 decisões.

**Critérios de avaliação:**
- Cada ADR é independente e autossuficiente (pode ser lido isoladamente).
- As decisões são fundamentadas em trade-offs explícitos, não em preferência de tecnologia.
- A ADR-0002 (contexto) demonstra compreensão de engenharia de contexto — context rot, orçamento de atenção, perguntas multi-domínio.
- A ADR-0003 (contradições) demonstra entendimento de que RAG é um problema de dados, não só de modelo.
- O uso do Claude como devil's advocate melhorou a qualidade das decisões (as versões finais são mais robustas que as iniciais).

---

#### Exercício 1.2 — Design de prompt engineering como artefato de arquitetura

**Contexto:** Você precisa definir a estratégia de prompt engineering e context engineering do projeto como artefato versionado. O prompt não é texto informal — é código que precisa ser gerenciado com o mesmo rigor.

**Ferramentas a utilizar:** Claude (chat) + GitHub Copilot

**Inputs fornecidos:**
- O cenário completo.
- O system prompt prototipado pelo desenvolvedor (simulado — use o prompt abaixo como base para melhorar):

```
Você é o assistente de atendimento da NovaTech, empresa de logística.
Responda perguntas sobre procedimentos, SLAs e regras de frete.
Use apenas as informações dos documentos fornecidos.
Cite a fonte. Se não souber, diga que não sabe.
```

- Os guardrails do Product Specialist: *"(1) Sempre citar fonte. (2) Nunca inventar prazos ou valores. (3) Quando não encontrar resposta, dizer explicitamente. (4) Responder em português formal."*
- Os chunks de referência do pipeline (ver **Anexo B**) para usar como dados de teste no script.

**Tarefa:**
1. Usando o **Claude**, defina: onde os prompts ficam versionados no repositório, como são nomeados, como são testados, e quem pode alterá-los.

2. Identifique quais partes do system prompt são estáticas (raramente mudam) e quais são dinâmicas (mudam conforme o contexto — ex: o tier do cliente, os chunks recuperados). Defina a "anatomia do contexto" completa de uma query: system prompt (estático) + metadados do cliente (dinâmico) + chunks recuperados (dinâmico) + pergunta (dinâmico) + histórico de conversa (dinâmico, crescente). Estime o tamanho de cada parte e defina o orçamento de contexto total.

3. Usando o **GitHub Copilot**, crie um script de teste automatizado de prompts: dado um prompt, um conjunto de perguntas e respostas esperadas, o script envia cada pergunta ao LLM e verifica se a resposta atende critérios básicos (contém citação de fonte, não contém termos proibidos, etc). O script não precisa ser completo — o objetivo é demonstrar o conceito.

4. Defina como o prompt se relaciona com o Harness: quais guardrails são enforçados no prompt (probabilístico) e quais deveriam ser enforçados fora do prompt (determinístico, ex: um filtro que valida se a resposta contém citação).

**Entregável:** O documento de estratégia com a anatomia de contexto, o script de teste gerado com o Copilot, e a análise de enforcement probabilístico vs determinístico.

**Critérios de avaliação:**
- Os prompts são tratados como código (versionados, testados, revisados).
- A anatomia de contexto demonstra pensamento de engenharia de contexto (não é apenas "o prompt" — é o contexto completo que o modelo recebe, com orçamento por parte).
- A separação entre enforcement probabilístico e determinístico demonstra maturidade de engenharia.
- O script de teste é funcional (ou ao menos demonstra claramente o conceito).

---

#### Exercício 1.3 — Revisão crítica de uma proposta de RAG

**Contexto:** Um desenvolvedor mais júnior propôs uma arquitetura de RAG. Você precisa revisar.

**Ferramentas a utilizar:** Claude (chat)

**Inputs fornecidos:**
- O cenário completo.
- A proposta (simulada): *"Vamos usar Azure AI Search com embeddings do ada-002. Todos os documentos serão indexados num único índice. Chunking fixo de 512 tokens sem overlap. O LLM recebe os 3 chunks mais similares. Usaremos GPT-4o para geração. O pipeline de ingestão roda manualmente quando alguém lembra de atualizar."*

**Tarefa:**
1. Faça sua própria revisão técnica da proposta: identifique ao menos 4 problemas ou riscos.

2. Em seguida, use o **Claude** para uma segunda revisão: forneça a proposta e peça ao Claude que identifique problemas. Compare a lista do Claude com a sua: o que o Claude encontrou que você não viu? O que você encontrou que o Claude não mencionou?

3. Para cada problema (de ambas as listas), proponha uma alternativa.

4. Reescreva a proposta incorporando as melhorias.

**Entregável:** Sua revisão original, a revisão do Claude, a comparação entre as duas, e a proposta reescrita.

**Critérios de avaliação:**
- Os problemas identificados são reais e demonstram compreensão de RAG (ex: chunking fixo sem overlap perde contexto em fronteiras; 3 chunks pode ser insuficiente para perguntas complexas; ingestão manual é um risco operacional).
- A comparação humano vs Claude é honesta (reconhece onde cada um acertou e errou).
- A proposta reescrita resolve os problemas sem overengineering.
- O exercício demonstra o uso de IA como par de revisão, não como substituto do julgamento.
