# Camada 1 - Orquestração de Ferramentas

## Objetivo

Coordenar ingestão, recuperação e geração com regras determinísticas, garantindo contexto suficiente e rastreável sem ultrapassar o orçamento da ADR-0002.

## Estado atual

Já implementado:

- Ingestão e indexação em Azure AI Search.
- Endpoint de consulta com recuperação de trechos.
- Integração inicial com bot no Teams.

Falta:

- Fluxo de orquestração explícito por etapa e por decisão.
- Contrato de dados claro entre recuperação, geração e verificação.
- Tratamento determinístico de pergunta multi-domínio e de conflito documental.

## Entradas e saídas

Entradas obrigatórias:

- Pergunta do atendente.
- Identificador de sessão.
- Contexto de conversa (turno atual e resumo do turno anterior).
- Catálogo de documentos válidos: POL-001, PROC-042, PROC-042-v2, SLA-2024, FAQ-Atendimento.

Saídas obrigatórias para a Camada 2:

- Resposta estruturada candidata: answer, source_document, confidence_score.
- Trilha de decisão da orquestração:
  - domínios detectados;
  - candidatos recuperados e 5 trechos finais;
  - pontuações de relevância;
  - consumo de contexto;
  - sinais de conflito documental;
  - sinal de insuficiência de evidência.

## Fluxo decisório

### Etapa 1 - Preparação de contexto de sessão

1. Receber pergunta e contexto da sessão.
2. Aplicar janela deslizante da ADR-0002:
   - manter pergunta atual completa;
   - manter resumo do turno anterior com no máximo 150 tokens;
   - descartar turnos T-2 e anteriores.
3. Se houver retomada explícita de tema, executar nova recuperação completa.

### Etapa 2 - Planejamento da recuperação

1. Classificar consulta em domínio único ou multi-domínio.
2. Definir orçamento por componente:
   - prompt de sistema: 1200 tokens;
   - histórico: 800 tokens;
   - trechos recuperados: 3500 tokens;
   - pergunta: 300 tokens;
   - margem de segurança: 200 tokens.
3. Se houver indício de contradição documental, habilitar modo de contradição com teto de até 10000 tokens.

### Etapa 3 - Recuperação e reclassificação

1. Recuperar 20 candidatos por similaridade vetorial.
2. Reclassificar para os 5 melhores por relevância semântica.
3. Em multi-domínio, garantir pelo menos 1 trecho por domínio detectado.
4. Aplicar regra de suficiência:
   - se menos de 2 trechos tiverem pontuação superior a 3,0 no Semantic Ranker, não gerar resposta conclusiva.

### Etapa 4 - Empacotamento para geração

1. Empacotar os 5 trechos respeitando o orçamento.
2. Preservar metadados mínimos por trecho:
   - source_document;
   - versão;
   - data de vigência ou atualização;
   - domínio;
   - classificação da fonte.
3. Em conflito PROC-042 v1 e v2, incluir as versões relevantes com sinalização de conflito para validação.
4. Chamar o modelo com contrato de resposta estruturada.

### Etapa 5 - Repasse para verificação

1. Enviar resposta candidata e trilha de decisão para a Camada 2.
2. Marcar o desfecho da orquestração:
   - geração normal;
   - insuficiência de evidência;
   - risco elevado com encaminhamento para revisão humana.

## Regras determinísticas

1. Proibir geração com menos de 2 trechos relevantes acima do limiar.
2. Proibir empacotamento acima do orçamento da ADR-0002, exceto no fluxo de contradição com teto controlado.
3. Proibir resposta sem metadado de fonte nos trechos usados.
4. Exigir justificativa registrada para qualquer priorização de versão documental.

## Critérios de go-live da camada

Bloqueantes:

1. Fluxo completo implementado com trilha de decisão por requisição.
2. Aplicação das regras da ADR-0002 na montagem de contexto.
3. Suporte funcional a consulta multi-domínio com diversidade de domínio.
4. Regra de insuficiência de evidência ativa para bloquear resposta especulativa.

Desejáveis:

1. Otimização de latência da classificação de domínio.
2. Heurística de desempate por recência documental.

## Plano de fechamento de gap

1. Formalizar contrato de orquestração em tipos compartilhados.
2. Implementar módulo único coordenador de fluxo.
3. Integrar validação de fonte da Camada 2 no repasse.
4. Testar casos mínimos:
   - devolução simples;
   - frete especial;
   - consulta multi-domínio;
   - conflito PROC-042 v1 x v2;
   - pergunta sem cobertura documental.
