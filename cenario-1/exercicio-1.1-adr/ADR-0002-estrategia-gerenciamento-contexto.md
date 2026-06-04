# ADR-0002: Estratégia de Gerenciamento de Contexto no Pipeline RAG

## Status: Proposto

**Data:** 2026-06-02
**Autores:** Tech Lead / Arquiteto de Solução
**Revisores:** Especialista de Produto, Desenvolvedor Responsável pelo Pipeline

---

## Contexto

O pipeline RAG da NovaTech precisa de uma estratégia explícita para o que entra na janela de contexto do LLM por consulta. Sem essa definição, os seguintes problemas se manifestam em produção:

- **Estouro de contexto silencioso:** o coordenador de fluxo pode truncar trechos relevantes sem alertar o usuário, gerando respostas parciais ou incorretas.
- **Perguntas multi-domínio sem cobertura adequada:** uma pergunta como *"qual o prazo de entrega de carga refrigerada para cliente Platinum com devolução solicitada?"* cruza SLA-2024, PROC-042 e POL-001 simultaneamente — uma recuperação ingênua (os N mais similares por similaridade) pode retornar trechos de apenas um domínio.
- **Degradação de contexto em sessões longas no Teams:** o assistente mantém histórico de turno a turno; perguntas anteriores da mesma sessão deslocam trechos relevantes para a pergunta atual, e o modelo começa a responder com base em contexto obsoleto.

**Parâmetros de referência levantados pelo desenvolvedor:**
- Base estimada: ~12 milhões de tokens
- Segmentação por seção com sobreposição de 10%
- ~15% de documentos escaneados (requerem OCR)
- PDFs com tabelas complexas são o maior desafio de extração
- Volume típico: 192 consultas RAG por dia

**Requisitos do Especialista de Produto relevantes para esta ADR:**
- Respostas devem citar a fonte (exige que o metadado de origem esteja no contexto)
- Documentos contraditórios devem mostrar ambas as versões com data
- O assistente nunca deve inventar informações (exige controle rigoroso do que entra no contexto)

---

## Decisão

### 1. Tamanho máximo de contexto por consulta

**Limite fixo: 6.000 tokens de entrada por consulta, distribuídos assim:**

| Componente | Tokens reservados |
|---|---|
| Prompt de sistema (instruções + regras de citação) | 1.200 |
| Histórico de conversa (ver seção 4) | 800 |
| Trechos recuperados | 3.500 |
| Pergunta do usuário | 300 |
| Margem de segurança | 200 |
| **Total** | **6.000** |

**Justificativa:** Uma consulta típica ao pipeline RAG totaliza ~3.000 tokens de entrada (prompt de sistema + trechos recuperados + pergunta); consultas com contradição entre documentos podem atingir 8.000–10.000 tokens. Esses valores foram estimados considerando a segmentação por seção com sobreposição de 10% e o tamanho médio dos documentos da NovaTech (~12 milhões de tokens na base total). O limite de 6.000 cobre o fluxo principal com margem. Para o fluxo de contradição, o coordenador de fluxo pode expandir os trechos para até 5.500 tokens (reduzindo a margem de segurança), já que a detecção de contradição é sinalizada antes da montagem do prompt (ver APENDICE-tratamento-documentos-contraditorios.md). O limite de 10.000 tokens é reservado como teto absoluto para contradições com múltiplas versões.

O limite de 6.000 tokens é uma decisão de custo e qualidade, não de capacidade — todos os modelos viáveis para este caso de uso suportam janelas muito maiores. Janelas de contexto muito grandes não melhoram a qualidade do RAG — o modelo perde foco nos trechos relevantes quando há muito texto irrelevante ao redor (fenômeno conhecido como "perdido no meio"). Essa limitação é documentada em modelos de diferentes fornecedores e não depende da escolha específica de modelo.

### 2. Número de trechos recuperados

**Os 5 melhores por similaridade semântica, com reclassificação por relevância documental.**

**Processo de recuperação em duas etapas:**

1. **Recuperação inicial:** o Azure AI Search retorna os 20 melhores candidatos por similaridade vetorial.
2. **Reclassificação:** o Azure AI Search Semantic Ranker (ou um reclassificador cruzado leve) reduz para os 5 melhores, priorizando coerência contextual e diversidade de domínio (ver seção 3).

**Tamanho alvo por trecho: 400–600 tokens** (compatível com segmentação por seção com sobreposição de 10%, conforme levantado pelo desenvolvedor). 5 trechos × 600 tokens = 3.000 tokens, dentro da janela reservada.

**Limiar mínimo aceitável:** se o reclassificador retornar menos de 2 trechos com pontuação acima do limiar de relevância (3,0 por padrão), o coordenador de fluxo deve sinalizar ao usuário que a base não contém informação suficiente para responder — em vez de responder com baixa confiança. Isso implementa o requisito "nunca inventar informações".

O limiar se refere à **pontuação do Azure AI Search Semantic Ranker**, que varia de 0 a 4. Essa pontuação mede a relevância contextual do trecho em relação à pergunta — não apenas similaridade vetorial, mas coerência de significado. Um trecho com pontuação 3,0 está no quarto superior da escala e indica forte alinhamento semântico com a consulta. Trechos abaixo de 3,0 tendem a ser tangencialmente relacionados ao tema, mas não respondem diretamente à pergunta.

**Como o limiar de 3,0 deve ser calibrado:** o valor inicial é uma estimativa de partida, não um valor definitivo. A calibração deve ocorrer nas primeiras duas semanas de uso em ambiente de homologação, da seguinte forma:

1. Reunir um conjunto de pelo menos 50 perguntas representativas, com resposta conhecida baseada nos documentos da NovaTech.
2. Para cada pergunta, registrar a pontuação do Semantic Ranker para o trecho mais relevante retornado.
3. Identificar o menor valor de pontuação entre os trechos que produziram respostas corretas — esse valor é o candidato a limiar mínimo.
4. Verificar quantas perguntas válidas seriam recusadas pelo sistema com esse limiar (falsos negativos). Se o percentual superar 10%, o limiar deve ser reduzido gradualmente até equilibrar falsos negativos e respostas incorretas.

O valor calibrado deve ser documentado junto ao resultado dos testes de homologação e revisado sempre que o modelo de embeddings ou o reclassificador for atualizado.

### 3. Estratégia para perguntas multi-domínio

Perguntas que cruzam domínios (SLA + frete + devolução) são identificadas por classificação prévia e tratadas com recuperação por múltiplas consultas.

**Fluxo:**

```
Pergunta do usuário
       │
       ▼
┌─────────────────────────────┐
│  Classificador de domínio   │  (chamada leve ao LLM ou filtro por palavras-chave)
│  Saída: lista de domínios   │  Ex.: ["SLA", "PROC-042", "POL-001"]
└─────────────────────────────┘
       │
       ▼ (para cada domínio identificado)
┌─────────────────────────────┐
│  Subconsulta de recuperação │  Reformula a pergunta focada no domínio
│  (1 subconsulta por domínio)│
└─────────────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│  Combinação + deduplicação  │  Remove trechos duplicados; mantém diversidade de domínio
│  Reclassificação global     │  Seleciona os 5 melhores representativos entre domínios
└─────────────────────────────┘
       │
       ▼
  Montagem do prompt final
```

**Regra de diversidade na combinação:** ao selecionar os 5 trechos finais, pelo menos 1 trecho por domínio identificado deve estar presente, mesmo que a pontuação de similaridade seja inferior à de um sexto trecho do domínio mais relevante. Isso evita que SLA sempre "vença" a reclassificação quando a pergunta menciona prazo.

**Custo adicional:** o classificador de domínio adiciona ~150 ms de latência e ~200 tokens de chamada leve. Para consultas de domínio único (estimativa: ~70% do volume), o classificador retorna um único domínio e o fluxo segue com recuperação padrão.

### 4. Degradação de contexto em conversas longas (sessões no Teams)

**Estratégia: janela deslizante com compressão de turno.**

O assistente no Teams mantém sessões onde múltiplas perguntas são feitas em sequência. O histórico de conversa não deve simplesmente se acumular — trechos de perguntas anteriores são irrelevantes para a pergunta atual e ocupam espaço que deveria ser de trechos atualizados.

**Regras de gerenciamento do histórico:**

| Turno | O que é mantido |
|---|---|
| Turno atual (T) | Pergunta completa + trechos recuperados |
| Turno anterior (T-1) | Apenas a resposta final resumida (máx. 150 tokens) |
| Turnos T-2 e anteriores | Descartados do contexto |

**Justificativa da janela de 2 turnos:** experiências com assistentes de atendimento mostram que perguntas de continuação tipicamente se referem ao turno imediatamente anterior ("e o prazo para devolução nesse caso?"). Referências a turnos mais antigos são raras e, quando ocorrem, o atendente pode reformular a pergunta. Manter mais turnos aumenta o risco de degradação de contexto sem benefício proporcional.

**Compressão do turno anterior:** a resposta de T-1 é resumida para no máximo 150 tokens antes de ser incluída no contexto de T. A compressão pode ser feita pelo próprio LLM em chamada separada ou por extração dos trechos de citação de fonte. Os trechos recuperados em T-1 são sempre descartados.

**Sinal de retomada de contexto:** se o usuário usar expressões como "voltando ao tema anterior" ou "aquela pergunta sobre X", o coordenador de fluxo deve tratar como nova consulta completa, ignorando o histórico comprimido e executando nova recuperação de documentos.

---

## Consequências

**Positivas:**
- Limite explícito de 6.000 tokens previne custos inesperados e comportamento degradado por contexto excessivo.
- Recuperação por múltiplas consultas para perguntas multi-domínio resolve a lacuna mais crítica da recuperação ingênua por similaridade pura.
- Janela deslizante com compressão elimina a degradação de contexto sem exigir que o atendente reinicie a sessão.
- Limiar de relevância (3,0 na escala do Semantic Ranker) implementa diretamente o requisito "nunca inventar informações" — o sistema prefere admitir ausência de informação a responder com baixa confiança.
- Metadados de fonte nos trechos (definidos no apêndice de documentos contraditórios) garantem que a citação de fonte seja sempre possível dentro da janela de contexto.

**Negativas e riscos:**
- **Classificador de domínio adiciona complexidade:** mais um componente para testar, monitorar e manter. Se o classificador errar o domínio, a recuperação por múltiplas consultas pode ignorar domínios relevantes.
- **Regra de diversidade na combinação pode degradar a qualidade:** forçar 1 trecho por domínio pode incluir um trecho pouco relevante de um domínio secundário, introduzindo ruído na resposta.
- **Compressão do turno anterior perde nuance:** a resposta resumida de T-1 pode omitir contexto que o atendente precisaria para perguntas de continuação. O sistema não tem como saber o que o atendente considerou relevante da resposta anterior.
- **O limiar de 3,0 é arbitrário sem validação empírica.** Um valor muito alto aumenta falsos negativos (sistema recusa responder quando poderia); muito baixo aumenta alucinações por trechos irrelevantes. Precisa ser calibrado com dados reais antes da entrada em produção.
- **Sessões longas no Teams (mais de 10 turnos) não são cobertas:** a estratégia de 2 turnos funciona para a maioria dos casos, mas sessões de atendimento complexas podem se beneficiar de uma estratégia de memória mais sofisticada em versão futura.

**Condições para revisão desta decisão:**
1. Taxa de falha em consultas multi-domínio superior a 15% nos primeiros 30 dias de produção.
2. Retorno dos atendentes indicando que o assistente "esquece" contexto relevante com frequência.
3. Custo médio por consulta superar 2x a estimativa (indicaria que o classificador de domínio está acionando recuperação por múltiplas consultas de forma excessiva).
4. Troca do modelo de linguagem: os limites de tokens por componente (tabela da seção 1) e o limiar do reclassificador semântico (seção 2) foram calibrados para o modelo atual. Se o modelo for substituído, esses parâmetros devem ser recalibrados antes da entrada em produção, pois modelos diferentes tokenizam o texto de forma distinta e podem usar mecanismos de pontuação com escalas diferentes.

---

## Alternativas Consideradas

### Alternativa A: Recuperação ingênua pelos N mais similares (sem classificação de domínio)

Recuperar sempre os 5 trechos mais similares à pergunta original, sem lógica adicional de múltiplas consultas ou diversidade de domínio.

**A favor:**
- Implementação mais simples; menor latência; zero risco de erro no classificador.
- Para ~70% das consultas de domínio único, produz resultado equivalente à estratégia decidida.

**Contra:**
- Falha sistemática em perguntas multi-domínio: a recuperação retorna 5 trechos do domínio mais similar à pergunta, deixando domínios secundários sem representação. Uma pergunta sobre "prazo de devolução de carga refrigerada para cliente Platinum" pode retornar apenas trechos de SLA, sem nenhum trecho de POL-001 (política de devolução).
- Não há mecanismo de contingência quando os 5 trechos retornados são irrelevantes — o modelo responde com o que tem.

**Por que descartada:** os documentos contraditórios e as perguntas multi-domínio são casos de uso explicitamente previstos. Ignorar essa complexidade na recuperação transfere a responsabilidade para o LLM, que não tem garantia de identificar a ausência de informação de um domínio secundário.

---

### Alternativa B: Janela de contexto máxima (incluir todos os trechos disponíveis)

Usar a janela de contexto do modelo ao máximo e incluir o maior número possível de trechos — ou até documentos completos — por consulta, sem limite fixo.

**A favor:**
- Elimina o risco de deixar trechos relevantes fora do contexto.
- Resolve o problema de perguntas multi-domínio naturalmente: se todos os domínios estão no contexto, o modelo encontra o que precisa.
- Simplifica o pipeline: sem limite de tokens a gerenciar, sem classificador de domínio.

**Contra:**
- **Custo cresce proporcionalmente ao tamanho do contexto.** A título de ilustração com o GPT-4o: 128k tokens de entrada × 192 consultas/dia × $2,50/M tokens = ~$2.300/mês, contra ~$72/mês com o limite de 6.000 tokens — uma diferença de 30 vezes. Modelos alternativos têm precificações distintas, mas a relação entre tamanho de contexto e custo é linear em todos os casos.
- **Qualidade degrada com contexto excessivo:** estudos de 2023–2024 mostram que modelos de linguagem têm desempenho inferior quando a informação relevante está no meio de contextos muito longos (fenômeno "perdido no meio"). Esse comportamento foi documentado em múltiplos modelos e não depende do fornecedor.
- **Latência aumenta linearmente:** processar dezenas de milhares de tokens leva significativamente mais tempo que processar 6.000. Para uso em tempo real no Teams, isso é perceptível independentemente do modelo.

**Por que descartada:** o custo operacional cresce de forma inviável com qualquer modelo do mercado atual. A degradação de qualidade com contexto excessivo reforça que limitar o contexto é uma decisão de qualidade, não apenas de custo.

---

### Alternativa C: Histórico completo de sessão sem compressão (para degradação de contexto)

Manter todos os turnos da sessão no contexto, descartando apenas quando atingir o limite de tokens.

**A favor:**
- Sem risco de perda de contexto relevante de turnos anteriores.
- O modelo tem visibilidade completa da conversa e pode responder perguntas de continuação complexas com mais precisão.

**Contra:**
- A degradação de contexto ocorre inevitavelmente: em sessões longas, trechos de perguntas antigas dominam o espaço disponível para trechos atualizados relevantes à pergunta atual.
- O comportamento de descarte por limite de tokens é imprevisível: a janela sem compressão descarta turnos inteiros de forma abrupta quando o limite é atingido, gerando incoerência.
- Custo cresce com o tamanho da sessão, sem benefício proporcional após o segundo turno.

**Por que descartada:** a janela deslizante com compressão oferece o benefício do contexto do turno anterior (caso de uso real de perguntas de continuação) a um custo fixo e previsível, sem o risco de degradação de contexto.
