# Verificacao de source_document

Implementacao em TypeScript (Node.js) para o passo de verificacao deterministica de `source_document` do exercicio 3.1.

## O que esta implementado

- Validacao de structured output com Zod.
- Validacao deterministica de `source_document` contra allowlist oficial da NovaTech.
- Integracao de fluxo com bloqueio da resposta quando invalida.
- Emissao de evento de rejeicao para observabilidade.
- Testes unitarios cobrindo os casos minimos do enunciado.

## Fontes curtas validas

- POL-001
- PROC-042
- PROC-042-v2
- SLA-2024
- FAQ-Atendimento

## Contrato da funcao deterministica

Entrada:

- Objeto com campo `source_document`.

Saida:

- `isValid: boolean`
- `reason: string`
- `normalizedSource: string`

## Arquivos principais

- `src/model-response-schema.ts`: schema Zod do structured output.
- `src/source-document-validator.ts`: funcao deterministica `validateSourceDocument`.
- `src/response-harness.ts`: fluxo que executa schema -> validacao de source -> decisao de retorno.
- `tests/source-document-validator.test.ts`: testes minimos + integracao do fluxo.

## Executar localmente

```bash
npm install
npm test
```
