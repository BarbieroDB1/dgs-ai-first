# Critérios para uma skill estar boa para uso

1. Conformidade estrutural (verificável mecanicamente)
- Frontmatter válido: name bate com o diretório, description tem keywords de ativação, compatibility descreve dependências
- SKILL.md dentro do budget de ~500 linhas; material de referência em references/
- Referências a arquivos de suporte incluem instrução explícita de quando carregá-los

2. Eficácia instrucional (verificável testando com o agente)
- O agente ativa a skill pelos triggers certos — nem tarde demais, nem em contextos errados
- Após carregar a skill, o agente gera código que passa no checklist interno sem intervenção humana
- Os gotchas cobrem falhas reais observadas em outputs anteriores do agente, não falhas hipotéticas

3. Estabilidade (verificável ao longo do tempo)
- A skill sobreviveu a pelo menos 2–3 usos reais sem precisar de correção de emergência
- Os anti-padrões listados foram observados em geração real, não antecipados
- Uma mudança de dependência (ex: upgrade de @azure/functions) foi absorvida sem quebrar os exemplos