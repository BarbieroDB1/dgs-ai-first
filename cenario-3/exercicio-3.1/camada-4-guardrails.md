# Camada 4 - Guardrails

## Objetivo

Definir limites de segurança combinando regras determinísticas em código com orientação probabilística por prompt, incluindo revisão humana em casos de risco.

## Estado atual

Já implementado:

- Guardrails de produto formalizados no cenário 2.

Falta:

- Integração completa de guardrails no fluxo de execução.
- Critérios operacionais claros para human-in-the-loop.

## Estratégia de guardrails

Determinísticos:

1. Structured output obrigatório.
2. Bloqueio por schema inválido.
3. Bloqueio por source_document inválido.
4. Bloqueio por evidência insuficiente.

Probabilísticos:

1. Prompt de sistema reforçando não inventar informação.
2. Prompt exigindo citação de fonte válida e linguagem cautelosa em conflito documental.

Human-in-the-loop:

1. Revisão humana obrigatória para baixa confiança em tema sensível.
2. Revisão humana obrigatória em conflitos documentais críticos.

## Critérios de go-live da camada

Bloqueantes:

1. Structured output ativo e validado antes da resposta.
2. Pelo menos um ponto de revisão humana definido e operacional.
3. Bloqueios determinísticos conectados ao fluxo de resposta.

Desejáveis:

1. Matriz de risco por tipo de pergunta para decidir revisão humana.
2. Biblioteca de mensagens de fallback para resposta bloqueada.

## Plano de fechamento de gap

1. Consolidar regras em um módulo único de guardrails.
2. Definir responsável humano e SLA interno para revisões.
3. Criar testes de não regressão para regras de bloqueio.
