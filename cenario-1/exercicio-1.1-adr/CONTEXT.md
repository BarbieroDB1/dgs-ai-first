O projeto da NovaTech é introduzido em [cenario.md](../cenario.md), e outros arquivos na pasta são documentos relacionados ao projeto.

Como um Tech Lead do projeto, deve-se documentar decisões arquiteturais fundamentais nas capacidades e limitações da IA generativa.

Um desenvolvedor fez uma análise técnica inicial: *"Base estimada em +-12M tokens. PDFs com tabelas complexas são o maior desafio para extração. Documentos escaneados (+-15% da base) precisarão de OCR. Documentos contraditórios foram identificados em ao menos 3 procedimentos. Recomendação de chunking por seção com overlap de 10%."* ; 

Um Product Specialist passou os seguintes requisitos: *"Respostas devem citar fonte. Documentos contraditórios devem mostrar ambas as versões com indicação de data. Atualização máxima de 24h após publicação de novo documento. O assistente nunca deve inventar informações."*

Iremos registrar numa pasta [adr](./adr/), os registros de decisão arquitetural do projeto (Architecture Decision Record - ADR). As ADRs devem seguir o seguinte formato:

```
# ADR-NNNN: [Título da Decisão]
## Status: Proposto / Aceito / Depreciado
## Contexto: [Qual problema estamos resolvendo? Que forças atuam?]
## Decisão: [O que decidimos fazer?]
## Consequências: [O que isso implica — positivo e negativo?]
## Alternativas consideradas: [O que mais avaliamos e por que descartamos?]
```

Ao analisar uma ADR, aja como um *devil's advocate*. Quais os argumentos a favor e contra a decisão tomada? Quais as alternativas?

---
Arquivos de ADR devem conter apenas conteúdo relevante ao assunto daquela ADR. Informações extras podem ser adicionadas como apêndices na pasta de ADRs, e alguns arquivos já existem para serem analisados, referenciados e editados.

O documento deve ser escrito em pt-BR, para leitores brasileiros. Evite termos em inglês sem explicação.

ADRs devem ser autosuficientes: decisões tomadas em outras ADRs não devem influenciar decisões de uma ADR nova.