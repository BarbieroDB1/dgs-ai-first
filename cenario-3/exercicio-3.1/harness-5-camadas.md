# Harness de IA NovaTech - Índice dos Artefatos

## Objetivo

Organizar o design do harness em 5 camadas em documentos isolados, para facilitar ingestão, leitura e manutenção.

## Contexto operacional resumido

- Pipeline de ingestão funcional com 847 documentos indexados.
- Endpoint de consulta ativo com recuperação de trechos.
- Bot do Teams em homologação com 5 atendentes piloto.
- Taxa atual de respostas incorretas: 12%.

## Camadas em documentos separados

1. Camada 1 - [camada-1-tool-orchestration.md](camada-1-tool-orchestration.md)
2. Camada 2 - [camada-2-verification-loops.md](camada-2-verification-loops.md)
3. Camada 3 - [camada-3-contexto-e-memoria.md](camada-3-contexto-e-memoria.md)
4. Camada 4 - [camada-4-guardrails.md](camada-4-guardrails.md)
5. Camada 5 - [camada-5-observabilidade.md](camada-5-observabilidade.md)

## Próximos artefatos de implementação

- Especificação da verificação de fonte: [proximo-passo-verificacao-fonte.md](proximo-passo-verificacao-fonte.md)
- Matriz de regressão baseada no Anexo B: [matriz-regressao-anexo-b.md](matriz-regressao-anexo-b.md)

## Dependências entre camadas

1. A Camada 1 precisa enviar trilha de decisão para a Camada 2.
2. A Camada 3 impõe o orçamento de contexto que limita a Camada 1.
3. A Camada 4 usa sinais das Camadas 1 e 2 para bloqueio e revisão humana.
4. A Camada 5 monitora eventos e retroalimenta ajustes nas Camadas 1 a 4.