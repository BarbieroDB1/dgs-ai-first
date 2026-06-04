# Apêndice: Mitigações Arquiteturais para o Requisito de Não-Alucinação

**Contexto:** Nenhum LLM atual garante ausência completa de alucinação por propriedade emergente do modelo. "O assistente nunca deve inventar informação" é uma meta arquitetural, não uma promessa de fornecedor. A escolha do modelo influencia a probabilidade e o padrão de falha, mas não elimina o risco. A mitigação real depende da arquitetura do pipeline RAG.

As medidas abaixo são mandatórias independentemente do modelo escolhido.

---

## M1 — Política de fallback explícita no system prompt

O modelo deve ser instruído a responder "Não encontrei essa informação na documentação disponível" quando nenhum chunk recuperado cobre a pergunta. Esta instrução deve ser testada com perguntas sem cobertura documental antes do go-live — por exemplo, frete padrão abaixo de 500kg, que está ausente da documentação atual.

## M2 — Score de confiança do retrieval como gate

O orquestrador deve expor o score de relevância dos chunks (Azure AI Search semantic ranker). Queries com score máximo abaixo de um threshold devem acionar o fallback antes de chamar o LLM, evitando que o modelo tente responder com contexto irrelevante.

Threshold sugerido: 0,75 no índice semântico. O valor deve ser calibrado empiricamente com amostras reais de queries antes do go-live.

## M3 — Distinção de confiabilidade de fonte no contexto

O pipeline deve injetar metadados de confiabilidade da fonte no contexto (`document_type`: normativo vs. FAQ informal), permitindo ao modelo sinalizar ao usuário quando a resposta vem de fonte não validada — como o FAQ-Atendimento, que não passa por revisão formal do Compliance.

## M4 — Logging e revisão humana de amostras

5% das respostas devem ser amostradas e revisadas por um agente sênior semanalmente nas primeiras 8 semanas de operação. Padrões de falha devem retroalimentar o refinamento do system prompt.
