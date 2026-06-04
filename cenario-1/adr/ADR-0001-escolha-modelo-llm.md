# ADR-0001: Seleção do Modelo de Linguagem para o Assistente RAG da NovaTech

## Status: Proposto

**Data:** 2026-06-02
**Autores:** Tech Lead / Arquiteto de Solução
**Revisores:** Product Specialist, Gerente de Projeto

---

## Contexto

A NovaTech contratou a DB1 para construir um assistente de IA baseado em RAG (Retrieval-Augmented Generation) para sua equipe de atendimento ao cliente (45 agentes). O objetivo central é reduzir o tempo médio de busca em documentação de 12 minutos para menos de 2 minutos por chamado.

**Volume de uso:**
- 320 chamados/dia × 60% com consulta a documentação = **192 queries RAG/dia**
- Estimativa por query: ~3.000 tokens de input (sistema + chunks + pergunta) + ~500 tokens de output
- Volume mensal: ~20,2 M tokens/mês

**Infraestrutura existente:**
- Licenças Microsoft 365 E3 para todos os usuários
- Azure AI Services já provisionado
- Integração prevista com Microsoft Teams e SharePoint
- **Prazo: 3 meses** (discovery + desenvolvimento + go-live)

**Janela de contexto necessária:**
Com chunking por seção e sobreposição de 10%, uma query RAG típica totaliza ~3.700 tokens de input. Queries multi-domínio ou com resolução de contradição entre versões de documentos podem atingir 8.000–10.000 tokens. Janelas de contexto a partir de 32k tokens são suficientes para o fluxo principal.

---

## Alternativas Consideradas

### Alternativa 1: Azure OpenAI — GPT-4o

**Janela de contexto:** 128.000 tokens
**Preço de referência:** Input ~$2,50/M tokens | Output ~$10,00/M tokens

```
Input:  192 queries/dia × 3.000 tokens × 30 dias = 17,28 M tokens/mês → $43,20
Output: 192 queries/dia × 500 tokens × 30 dias   =  2,88 M tokens/mês → $28,80
Total estimado: ~$72/mês (~R$ 360/mês)
```

**Favorável:**
1. **Integração nativa com o ecossistema existente.** Conectores nativos com Azure AI Search, SharePoint Indexer e Power Automate. Com prazo de 3 meses, semanas economizadas em integrações são críticas.
2. **Data residency controlada.** Processamento configurável em Brazil South ou East US 2. A NovaTech provavelmente já tem DPA com a Microsoft via M365 E3 — sem necessidade de novo contrato de compliance.
3. **SLA de 99,9% com suporte enterprise consolidado.** Para um assistente em produção com 45 agentes, downtime tem custo operacional direto.
4. **Instruction-following consistente em formato estruturado.** Relevante para requisitos de formatação de respostas com citação de fonte e exibição de versões com data.
5. **Observabilidade integrada.** Azure Monitor e Application Insights nativos reduzem o trabalho de instrumentação.

**Contra:**
1. **"Fit natural com Microsoft" é argumento de conveniência, não de mérito técnico.** Escolher um modelo pelo ecossistema aceita um trade-off de qualidade sem evidência empírica de que GPT-4o é o melhor modelo para este caso de uso específico.
2. **Nenhuma vantagem demonstrada em tratamento de documentos contraditórios.** Não existe benchmark público que mostre GPT-4o superior a Claude 3.5/3.7 na tarefa de identificar e apresentar versões conflitantes de um mesmo procedimento.
3. **O custo de API é a parcela menor do TCO.** Os ~$72/mês não incluem Azure AI Search, Azure Functions/App Service, Document Intelligence (OCR) e custo de re-embedding.
4. **Latência pode ser mais alta se hospedado fora de Brazil South.** Modelos específicos frequentemente estão disponíveis apenas em East US 2, adicionando round-trip perceptível para respostas em tempo real no Teams.
5. **Tendência a respostas fluentes pode conflitar com o requisito de fidelidade à fonte.** GPT-4o tende a parafrasear em vez de transcrever, gerando respostas mais legíveis mas potencialmente menos fiéis ao documento de origem.

---

### Alternativa 2: Claude API (Anthropic) — via API direta ou Azure Marketplace

**Modelos candidatos:** Claude 3.5 Sonnet (custo-benefício) ou Claude 3.7 Sonnet (raciocínio estendido)
**Janela de contexto:** 200.000 tokens
**Preço de referência (Claude 3.5 Sonnet):** Input ~$3,00/M tokens | Output ~$15,00/M tokens

```
Input:  17,28 M tokens/mês × $3,00  = $51,84
Output:  2,88 M tokens/mês × $15,00 = $43,20
Total estimado: ~$95/mês (~R$ 475/mês)
```

**Favorável:**
1. **Fidelidade ao contexto é ponto forte documentado.** Em benchmarks independentes de RAG faithfulness, Claude 3.5/3.7 demonstra menor tendência a introduzir conhecimento paramétrico não presente nos chunks recuperados.
2. **Comportamento mais cauteloso diante de contradições.** Claude tem maior tendência a sinalizar inconsistências ao usuário em vez de escolher silenciosamente uma versão — comportamento alinhado ao requisito de exibir ambas as versões com data.
3. **Janela de 200k tokens permite incluir documentos completos como contexto de referência.** Reduz a dependência de um retrieval perfeito em cenários de contradição entre versões.
4. **Disponível no Azure Marketplace.** A NovaTech pode consumir Claude via Azure AI Studio, mantendo fatura consolidada sem novo contrato de fornecedor.
5. **Performance robusta com system prompts longos e complexos.** O prompt do assistente precisará de regras detalhadas; Claude tem comportamento mais estável com system prompts de 2.000+ tokens.

**Contra:**
1. **Custo ~30% maior que GPT-4o para o mesmo volume.** A diferença de ~$23/mês exige justificativa por benefício mensurável — não por preferência qualitativa.
2. **Integrações com SharePoint e Teams são menos maduras.** Não existem conectores nativos equivalentes. Com prazo de 3 meses, o desenvolvimento de integrações customizadas é risco real de cronograma.
3. **Data residency via API direta é menos controlável.** A API da Anthropic processa em infraestrutura nos EUA. Para dados de clientes com cláusulas de LGPD, isso pode ser bloqueador legal.
4. **Extended thinking (Claude 3.7) pode gerar latência inaceitável para uso em tempo real.** Deve ser explicitamente desabilitado se o modelo 3.7 for escolhido.
5. **Superioridade em faithfulness não foi validada no domínio específico.** Nenhum benchmark cobre logística brasileira, procedimentos de frete e políticas de devolução. A vantagem relativa pode não se traduzir sem testes empíricos.

---

### Alternativa 3: Modelos Open-Source via Ollama (autogerenciado)

**Modelos candidatos:** Llama 3.1 70B, Mistral 8x22B, Qwen 2.5 72B
**Implantação:** VM Azure com GPU
**Janela de contexto:** 32k–128k tokens dependendo do modelo

```
VM Azure Standard_NC24ads_A100_v4 (1x A100 80GB):
- On-demand: ~$3,50/hora × 24h × 30 dias ≈ $2.520/mês
- Reserved Instance (1 ano): ~$1.600/mês

Llama 3.1 70B (requer ~140GB VRAM quantizado Q4):
- Necessita 2x A100 ou 1x H100 → $3.000–$5.000/mês
```

Break-even vs. API proprietária ocorre apenas acima de ~5.000–10.000 queries/dia — volume 25–50x maior que o caso atual.

**Favorável:**
1. **Custo marginal por token zero após o setup.** Para volumes muito altos, o break-even pode ser favorável a longo prazo.
2. **Soberania total dos dados.** Um modelo 100% on-premises elimina qualquer dependência de processamento externo — relevante para requisitos rígidos de LGPD e residência de dados.
3. **Fine-tuning possível.** O modelo pode ser ajustado com exemplos do domínio se a terminologia for muito específica.
4. **Independência de fornecedor.** Sem risco de mudança de preços, descontinuação ou alteração de termos de serviço.

**Contra:**
1. **Custo de infraestrutura é proibitivo para este volume.** Para 192 queries/dia, o custo de API é ~$72–95/mês. O custo de autohosting de modelo competitivo é $1.600–$5.000/mês — 20–70x maior. Não há justificativa econômica.
2. **MLOps overhead é escopo oculto incompatível com o prazo.** Operar um Llama 3.1 70B em produção (quantização, monitoramento de GPU, batching, failover) é trabalho de engenharia de ML, não de desenvolvimento de aplicação. Em 3 meses, inviabiliza o projeto.
3. **Instruction-following de modelos menores é insuficiente.** Modelos que cabem em hardware acessível (7B–13B) têm desempenho significativamente inferior em formatação estruturada e raciocínio sobre múltiplas versões de documentos.
4. **O argumento de soberania de dados é parcialmente ilusório neste contexto.** A NovaTech já usa SharePoint (Microsoft) e Azure AI Services. O diferencial de soberania do Ollama frente ao Azure OpenAI — ambos rodando dentro da Azure — é marginal.
5. **Suporte e manutenção recaem integralmente sobre o time.** Patches de segurança, atualizações de modelo e drift de comportamento são responsabilidade interna sem SLA de fornecedor.

---

## Decisão

**Modelo selecionado: Azure OpenAI (GPT-4o)**

A seleção converge sobre três fatores que, juntos, superam as vantagens individuais das alternativas:

**1. Aderência ao cronograma é o constraint mais crítico.**
Com 3 meses de prazo, a integração nativa do Azure OpenAI com Azure AI Search, SharePoint Connector e Microsoft Teams elimina semanas de desenvolvimento de conectores customizados.

**2. A diferença de qualidade entre GPT-4o e Claude 3.5 é menor que o risco de integração.**
A superioridade do Claude em instruction-following — real em benchmarks gerais — não foi validada no domínio específico. A diferença de comportamento é mitigável por design de prompt; o risco de cronograma de integração não é.

> Esta decisão deve ser revisada se testes empíricos com o prompt de produção mostrarem diferença de qualidade superior a 15% em favor do Claude em tarefas de contradição documental, antes do go-live.

**3. Open-source é economicamente descartável para este volume.**
Com 192 queries/dia, o custo de API (~$72/mês) é 20–40x menor que o custo de infraestrutura para autohosting de modelo competitivo.

---

## Consequências

**Positivas:**
- Integrações com SharePoint e Teams nativas reduzem o desenvolvimento de conectores em 2–4 semanas estimadas.
- Azure Monitor e Application Insights nativos permitem rastrear latência, uso de tokens e falhas sem instrumentação adicional.
- Processamento dentro da região Azure (Brazil South / East US 2), compatível com LGPD e DPA Microsoft existente via M365.
- Custo operacional previsível: ~$72/mês para o volume atual, escalando linearmente com o uso.
- SLA de 99,9% adequado para uso em produção com 45 agentes.

**Negativas e riscos:**
- Vendor lock-in no ecossistema Microsoft: migração futura para outro modelo requereria refatoração da camada de integração.
- GPT-4o não é o modelo com melhor instruction-following do mercado; esta escolha aceita trade-off de qualidade marginal em favor de velocidade de entrega.
- Versão do modelo pode ser depreciada periodicamente; é necessário definir processo de atualização e re-teste antes de cada migração forçada.
- Custo de Document Intelligence (OCR para os ~15% de documentos escaneados) não está incluído na estimativa e deve ser orçado separadamente.

**Condições para revisão desta decisão:**
1. Testes de aceitação mostrarem taxa de falha superior a 10% em queries de contradição documental.
2. Volume de queries crescer para mais de 2.000 queries/dia, tornando o custo de API relevante para o orçamento.
3. A NovaTech identificar requisitos de compliance que impeçam processamento fora de ambiente 100% controlado.
4. Claude passar a ter integração nativa equivalente ao Azure OpenAI sem custo adicional de desenvolvimento.

---

## Apêndice: Matriz de Decisão

| Critério | Peso | Azure OpenAI GPT-4o | Claude API | Open-source Ollama |
|---|---|---|---|---|
| Aderência ao prazo de 3 meses | 25% | **Alto** (integrações nativas) | Médio (integrações manuais) | Baixo (MLOps overhead) |
| Qualidade em contradição documental | 20% | Médio-alto | **Alto** | Baixo-médio |
| Custo operacional para 192 q/dia | 20% | **Alto** (~$72/mês) | Alto (~$95/mês) | Baixo (~$1.600+/mês infra) |
| Data residency e compliance | 15% | **Alto** (Azure nativo) | Médio (via Marketplace) | Alto (on-premises) |
| Risco de alucinação (com mitigações) | 10% | Médio | Médio-baixo | Alto (modelos menores) |
| Observabilidade e suporte enterprise | 10% | **Alto** | Médio | Baixo |
| Independência de fornecedor | 0% | Baixo | Médio | Alto |

*"Independência de fornecedor" recebeu peso zero porque a NovaTech já depende da Microsoft para SharePoint e Teams. O argumento de diversificação de LLM não se sustenta quando a infraestrutura de dados já está integralmente no ecossistema Microsoft.*
