# Camada 2 - Ciclos de Verificação

## Objetivo

Validar deterministicamente a saída do modelo antes de responder ao atendente, reduzindo alucinação e erro de citação.

## Estado atual

Já implementado:

- Verificações pontuais no fluxo atual.

Falta:

- Ciclo de verificação em cadeia, com decisão de bloquear ou aprovar resposta.
- Validação de schema da resposta estruturada.
- Validação de source_document contra a lista oficial de documentos.

## Fluxo de verificação

1. Verificar schema estruturado obrigatório.
2. Verificar source_document na lista permitida.
3. Verificar coerência mínima entre resposta e trechos de evidência.
4. Classificar resultado:
   - aprovado;
   - suspeito;
   - rejeitado.
5. Emitir código de motivo para observabilidade.

## Critérios de go-live da camada

Bloqueantes:

1. Validação de schema ativa em 100% das respostas.
2. Validação de source_document ativa em 100% das respostas.
3. Rejeição automática para resposta inválida.

Desejáveis:

1. Regra adicional de coerência semântica entre answer e trechos.
2. Taxonomia padronizada de motivos de rejeição para análise operacional.

## Plano de fechamento de gap

1. Implementar função de validação de fonte em componente reutilizável.
2. Encadear validações antes da resposta final.
3. Registrar eventos com motivo de bloqueio e severidade.
