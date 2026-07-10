# User
Sou o Tech Lead do projeto. Com este cenário em mente, outras pessoas geraram os seguintes artefatos com IA:


```markdown
- Resumo dos artefatos gerados com IA:
  - *"O AGENTS.md foi gerado pelo Claude e refinado 4 vezes. A última versão tem 15 páginas."*
  - *"3 skills foram criadas. A Foundation foi refinada após testes; as outras duas foram usadas sem refinamento."*
  - *"O pipeline de ingestão e o query endpoint foram ~60-70% gerados pelo Copilot."*
  - *"O system prompt foi iterado 6 vezes, sem documentar por que cada mudança foi feita."*

```


Fiz uma análise de riscos básica dada essa informação, e cheguei nos seguintes riscos identificados:


```markdown
Riscos identificados
- AGENTS.md está muito grande e deveria ser separado em documentos de apoio. 15 Páginas é muita coisa para usar em todo contexto
- Para as skills, falta de refinamento é um risco. Sempre deve haver um teste para validar uma skill por mais simples que seja.
- Iterar sem documentação no system prompt é um problema, pois perdemos a rastreabilidade do _porque_ ele foi modificado. Deveriamos ter um commit para cada iteração não-trivial.

```


Você sendo meu co-reviewer, avalie a minha análise e verifique se consegue identificar mais riscos mesmo com esse contexto limitado. 

Temos pouco tempo para corrigir estes problemas, apenas ~2 semanas. Qual risco(dentre os meus e os possivelmente identificados por você) deveríamos priorizar, e quais podem ser um risco residual para ser corrigido num momento futuro?

---

# Claude

Sua análise está no caminho certo — os três riscos que você identificou são reais e bem fundamentados. Vou avaliar cada um, depois trazer o que mais consigo ver com este contexto, e finalmente priorizar.

## Avaliação dos seus riscos

**1. AGENTS.md com 15 páginas** — Válido. Documentos de instrução muito longos sofrem de diluição de atenção ("lost in the middle"): quanto maior o AGENTS.md, menor a chance de uma regra específica (como "usar Zod" ou "não logar dados sensíveis") ser efetivamente seguida pelo Copilot em toda geração. O incidente do módulo de feedback é evidência *direta* disso — não é coincidência que a regra ignorada tenha sido justamente uma regra "enterrada" num documento grande.

**2. Skills sem refinamento** — Válido, e eu reforçaria: você tem 2 de 3 skills usadas sem qualquer teste de validação. O risco não é só "a skill pode falhar" — é que vocês não têm *como saber* se ela falha, porque não há teste. Isso é um risco silencioso.

**3. System prompt sem documentação de iteração** — Válido. Sem rastreabilidade, se uma das 6 iterações introduziu uma regressão relacionada aos 12% de respostas incorretas, vocês não têm como isolar qual mudança causou o quê.

## Riscos adicionais que eu identificaria

**4. O incidente do módulo de feedback é sintoma de um padrão, não um caso isolado.** O pipeline de ingestão e o query endpoint — o coração do sistema, responsável pelos 12% de erro — foram 60-70% gerados pelo Copilot. Se a "revisão crítica" falhou uma vez (ignorou Zod, logou dados sensíveis) num módulo, não há garantia de que o mesmo não aconteça no código que efetivamente recupera e retorna respostas. Este é, na minha visão, o risco mais grave: **vocês não sabem o quão confiável é a revisão crítica aplicada ao código que já está em produção/staging.**

**5. Ausência de structured outputs é a causa raiz documentada do "campo obrigatório esquecido".** O próprio cenário já diz: quando o modelo esquece a fonte, nada impede a resposta de seguir. Isso não é um risco teórico — é a causa mecânica de parte dos 12% de erro (ou pelo menos do que os torna difíceis de detectar automaticamente).

**6. HITL não existe em lugar nenhum ainda.** Não há menção de nenhum ponto humano de validação no fluxo atual. Com 12% de erro e um bot já em staging com 5 atendentes reais, isso é uma lacuna de governança ativa, não hipotética.

**7. Possível questão de privacidade/LGPD já materializada.** O módulo de feedback logou dados sensíveis do atendente — isso pode já ser um incidente real em ambiente de staging, não um risco futuro. Merece tratamento como incidente, não como item de backlog.

**8. Falta de teste específico para os *modos de falha* já conhecidos.** Testes de integração cobrem ~75% do código, mas cobertura de código não é o mesmo que cobertura dos três modos de falha já identificados (alucinação, documento desatualizado, chunk incorreto). É possível ter 75% de cobertura e zero teste que capture esses cenários especificamente.

## Priorização para as 2 semanas

**Fazer agora (bloqueadores para o demo com confiança):**
1. **Structured outputs no query endpoint** — rápido de implementar (schema + validação), resolve o problema mecânico do campo de fonte ausente, e dá um sinal auditável (`confidence_score`) para decidir quando intervir. É o item de maior retorno por esforço.
2. **HITL básico usando o confidence_score** — uma vez que structured outputs existam, definir um limiar simples (ex: baixa confiança + tema sensível → resposta não é enviada sem revisão humana) é barato e cobre o maior risco de imagem para o demo.
3. **Corrigir o incidente do módulo de feedback** — não é risco, é incidente já ocorrido (dados sensíveis logados). Trate como prioridade de segurança, independente do demo.
4. **Revisão crítica focada** (não completa) do pipeline de ingestão e do query endpoint — não dá para reauditar 60-70% do código gerado em 2 semanas, mas dá para focar em validação de entrada, tratamento de dados sensíveis e lógica de retrieval, que são exatamente os pontos onde já houve falha em outro módulo.

**Risco residual (pode esperar):**
- **Tamanho do AGENTS.md** — afeta custo e qualidade a médio prazo, mas não é a causa dos 12% de erro nem bloqueia o demo. Refatorar em documentos de apoio depois.
- **Refinamento das 2 skills não testadas** — priorize *verificar* se elas estão no caminho crítico do demo. Se não estiverem, documentem o débito e testem depois.
- **Documentação retroativa das 6 iterações do system prompt** — não vale o tempo agora, a menos que vocês precisem investigar uma regressão específica ligada aos 12% de erro. O que importa é começar a documentar *daqui para frente* (commit por iteração não-trivial, como você já propôs).

O critério que usei: o que toca diretamente os 12% de erro e o que é um incidente ativo de dados sensíveis vai na frente; o que é dívida técnica/governança de longo prazo (tamanho de documento, testes de skills de baixo risco, arqueologia de prompt) pode ficar registrado como risco residual com dono e prazo definidos, mas não compete pelo tempo do demo.