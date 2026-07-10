# Matriz de Regressão - Baseada no Anexo B

## Objetivo

Garantir que a orquestração e os ciclos de verificação mantenham comportamento estável nos casos críticos de recuperação e resposta.

## Casos mínimos de regressão

| ID | Pergunta | Trechos esperados | Resultado esperado | Criticidade |
|---|---|---|---|---|
| R01 | Qual o prazo de devolução? | POL-001-A, POL-001-B | Resposta com prazo de 7 dias úteis e citação válida | Alta |
| R02 | Posso devolver carga perigosa? | POL-001-B, FAQ-03 | Resposta com não elegibilidade no processo padrão e encaminhamento para Gestão de Riscos | Alta |
| R03 | Qual o SLA do cliente Gold? | SLA-2024-B | Resposta com prazos corretos e fonte SLA-2024 | Alta |
| R04 | Qual o SLA do cliente Platinum? | SLA-2024-A, FAQ-15 | Resposta negando existência do tier Platinum | Alta |
| R05 | Frete para 600kg para Manaus? | PROC-042v2-A, PROC-042v2-B | Resposta com base na v2 e sinalização de versão quando aplicável | Alta |
| R06 | Frete para 300kg para Salvador? | Sem cobertura formal | Resposta de insuficiência de base documental | Alta |
| R07 | O que acontece com carga danificada? | FAQ-38 | Resposta cautelosa com sinalização de fonte informal | Média |
| R08 | Carga perigosa com frete expresso? | FAQ-32 | Resposta cautelosa, sem tratar FAQ como norma | Média |
| R09 | Qual o multiplicador para o Sudeste? | PROC-042v2-B e possível PROC-042-B | Resposta com controle de contradição v1 x v2 | Alta |
| R10 | Prazo de devolução + carga perigosa + frete especial | POL-001-A, POL-001-B, PROC-042v2-A, PROC-042v2-B | Resposta multi-domínio com cobertura de todos os domínios citados | Alta |

## Verificações por caso

1. Verificação de recuperação:
   - Os trechos críticos esperados aparecem entre os selecionados.
2. Verificação estrutural:
   - Resposta respeita schema e informa source_document válido.
3. Verificação de risco:
   - Casos sem cobertura formal não retornam resposta inventada.
4. Verificação de conflito:
   - Casos com v1 e v2 sinalizam contradição e evitam mistura silenciosa.

## Critério de aprovação inicial

1. Casos de criticidade alta: 100% de aprovação.
2. Casos de criticidade média: mínimo de 90%.
3. Zero caso de alucinação em pergunta sem cobertura.
