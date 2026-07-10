# Camada 3 - Contexto e Memória

## Objetivo

Controlar contexto e memória de conversa para manter precisão e previsibilidade de custo, aderindo à ADR-0002.

## Estado atual

Já implementado:

- Uso básico de contexto de conversa no endpoint.

Falta:

- Aplicação consistente da ADR-0002 em todas as requisições.
- Política padronizada de compressão de turno e descarte de histórico.

## Regras de contexto

1. Orçamento padrão por consulta: 6000 tokens.
2. Distribuição por componente conforme ADR-0002.
3. Janela deslizante:
   - turno atual completo;
   - resumo do turno anterior com até 150 tokens;
   - descarte de T-2 em diante.
4. Retomada explícita de assunto aciona nova recuperação completa.

## Critérios de go-live da camada

Bloqueantes:

1. Cálculo de orçamento de contexto centralizado e aplicado sempre.
2. Janela deslizante ativa com compressão do turno anterior.
3. Bloqueio de montagem de prompt quando orçamento for excedido sem rota de exceção.

Desejáveis:

1. Painel de consumo médio de tokens por requisição e por etapa.
2. Alerta antecipado de degradação por contexto excessivo.

## Plano de fechamento de gap

1. Criar componente único de cálculo de orçamento e empacotamento.
2. Padronizar formato do resumo de turno anterior.
3. Registrar eventos de corte de contexto para inspeção posterior.
