# Teste Automatizado de Prompts — NovaTech RAG Assistant

## Objetivo

Script que demonstra o conceito de **validação automatizada** de respostas de um LLM configurado como assistente de atendimento da NovaTech. Dado um prompt de sistema e um conjunto de perguntas com critérios esperados, o script:

1. Envia cada pergunta ao LLM
2. Aplica verificações automáticas na resposta
3. Gera um relatório com taxa de aprovação

## Verificações implementadas

| Critério | O que valida |
|----------|-------------|
| `must_contain_source_citation` | Resposta cita documento no padrão (POL-001, PROC-042, etc.) |
| `must_not_contain_forbidden_terms` | Resposta não usa linguagem de incerteza ("eu acho", "talvez") |
| `max_response_length` | Resposta respeita limite de caracteres |
| `must_refuse_or_redirect` | Para perguntas fora do escopo, recusa adequadamente |
| `must_mention_prazo` | Resposta menciona prazo quando pertinente |
| `must_contain_steps` | Resposta descreve etapas de um procedimento |
| `must_mention_hours_or_minutes` | Resposta menciona métricas de tempo (SLA) |
| `must_acknowledge_version_conflict` | Resposta reconhece conflito entre versões |
| `must_not_hallucinate` | Não inventa fontes para perguntas inválidas |

## Como executar

### Pré-requisitos

```bash
pip install openai
```

### Configuração

Defina uma das seguintes variáveis de ambiente:

**Azure OpenAI:**
```bash
export AZURE_OPENAI_ENDPOINT="https://seu-recurso.openai.azure.com/"
export AZURE_OPENAI_API_KEY="sua-chave"
export AZURE_OPENAI_API_VERSION="2024-02-01"
export LLM_MODEL="nome-do-deployment"
```

**OpenAI direta:**
```bash
export OPENAI_API_KEY="sua-chave"
export LLM_MODEL="gpt-4o"
```

### Execução

```bash
# Com API configurada
python test_prompts.py

# Modo dry-run (sem API, respostas simuladas)
python test_prompts.py --dry-run

# Config alternativo
python test_prompts.py --config meu_config.json
```

## Estrutura

```
teste-automatizado-prompts/
├── README.md           # Este arquivo
├── test_prompts.py     # Script principal
└── test_cases.json     # Casos de teste e configuração
```

## Limitações (é uma demonstração)

- Não implementa retry ou rate limiting
- Verificações são baseadas em regex/substring (não semânticas)
- Não integra com pipeline de RAG real (apenas testa o prompt isoladamente)
- Para produção, seria necessário adicionar avaliação semântica (ex: LLM-as-judge)
