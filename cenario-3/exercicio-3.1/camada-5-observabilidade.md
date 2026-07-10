# Camada 5 - Observabilidade

## Objetivo

Garantir visibilidade ponta a ponta do comportamento do assistente para detectar falhas cedo, medir qualidade e apoiar decisões de melhoria contínua.

## Estado atual

Já implementado:

- Logs básicos de endpoint.

Falta:

- Telemetria por etapa da orquestração.
- Métricas de qualidade de recuperação e resposta.
- Alertas acionáveis para degradação operacional.

## Telemetria mínima por etapa

1. Classificação de domínio.
2. Recuperação inicial de candidatos.
3. Reclassificação e seleção final.
4. Empacotamento de contexto.
5. Resultado dos ciclos de verificação.
6. Resultado final: aprovado, bloqueado, revisado por humano.

## Métricas mínimas

1. Taxa de respostas rejeitadas por fonte inválida.
2. Taxa de insuficiência de evidência.
3. Taxa de conflito documental detectado.
4. Latência por etapa e latência fim a fim.
5. Taxa de acionamento de revisão humana.

## Alertas mínimos

1. Aumento anormal de respostas suspeitas.
2. Queda de relevância na recuperação.
3. Crescimento de latência acima do limite acordado.

## Critérios de go-live da camada

Bloqueantes:

1. Eventos principais de todas as camadas emitidos e rastreáveis.
2. Métricas de qualidade disponíveis em painel operacional.
3. Alertas de degradação configurados com responsáveis definidos.

Desejáveis:

1. Correlação automática de incidente com etapa raiz.
2. Relatório semanal de qualidade e risco por domínio de negócio.

## Plano de fechamento de gap

1. Definir contrato de evento entre as 5 camadas.
2. Instrumentar pontos críticos da Camada 1 e Camada 2 primeiro.
3. Implantar alertas com limiares iniciais e recalibrar em homologação.
