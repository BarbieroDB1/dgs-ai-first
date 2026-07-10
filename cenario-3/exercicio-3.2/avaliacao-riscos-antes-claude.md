# Revisão dos Outputs de IA

>  - *"O AGENTS.md foi gerado pelo Claude e refinado 4 vezes. A última versão tem 15 páginas."*
>  - *"3 skills foram criadas. A Foundation foi refinada após testes; as outras duas foram usadas sem refinamento."*
>  - *"O pipeline de ingestão e o query endpoint foram ~60-70% gerados pelo Copilot."*
>  - *"O system prompt foi iterado 6 vezes, sem documentar por que cada mudança foi feita."*

Riscos identificados
- AGENTS.md está muito grande e deveria ser separado em documentos de apoio. 15 Páginas é muita coisa para usar em todo contexto
- Para as skills, falta de refinamento é um risco. Sempre deve haver um teste para validar uma skill por mais simples que seja.
- Iterar sem documentação no system prompt é um problema, pois perdemos a rastreabilidade do _porque_ ele foi modificado. Deveriamos ter um commit para cada iteração não-trivial.


