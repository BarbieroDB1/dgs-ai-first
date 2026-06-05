"""
Script de Teste Automatizado de Prompts — NovaTech RAG Assistant
================================================================
Demonstra o conceito de validação automatizada de respostas de LLM
contra critérios predefinidos (citação de fonte, termos proibidos, etc).

Uso:
    python test_prompts.py [--config test_cases.json] [--dry-run]

Requer:
    pip install openai  (compatível com Azure OpenAI e API OpenAI)
"""

import json
import re
import sys
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

try:
    from openai import AzureOpenAI, OpenAI
except ImportError:
    print("AVISO: pacote 'openai' não instalado. Executando em modo dry-run.")
    AzureOpenAI = None
    OpenAI = None


@dataclass
class TestResult:
    test_id: str
    question: str
    response: str
    passed: bool
    checks: dict[str, bool]
    errors: list[str]


def load_config(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_llm_client():
    """Cria cliente LLM baseado nas variáveis de ambiente disponíveis."""
    if os.getenv("AZURE_OPENAI_ENDPOINT"):
        return AzureOpenAI(
            azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
            api_key=os.getenv("AZURE_OPENAI_API_KEY"),
            api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01"),
        )
    elif os.getenv("OPENAI_API_KEY"):
        return OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return None


def send_question(client, system_prompt: str, question: str, model: str = None) -> str:
    """Envia pergunta ao LLM e retorna a resposta."""
    if client is None:
        return f"[SIMULAÇÃO] Resposta simulada para: {question}"

    model = model or os.getenv("LLM_MODEL", "gpt-4o")
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
        ],
        temperature=0.1,
        max_tokens=1000,
    )
    return response.choices[0].message.content


def check_source_citation(response: str, source_pattern: str) -> bool:
    """Verifica se a resposta contém citação de fonte no padrão esperado."""
    return bool(re.search(source_pattern, response))


def check_forbidden_terms(response: str, forbidden_terms: list[str]) -> tuple[bool, list[str]]:
    """Verifica se a resposta NÃO contém termos proibidos. Retorna (passou, termos_encontrados)."""
    found = [term for term in forbidden_terms if term.lower() in response.lower()]
    return len(found) == 0, found


def check_max_length(response: str, max_length: int) -> bool:
    """Verifica se a resposta não excede o tamanho máximo."""
    return len(response) <= max_length


def check_refusal(response: str) -> bool:
    """Verifica se a resposta indica recusa/redirecionamento para perguntas fora do escopo."""
    refusal_indicators = [
        "não possuo essa informação",
        "não encontrei",
        "fora do escopo",
        "não está disponível na documentação",
        "não tenho informação",
        "não consta na documentação",
        "não faz parte",
    ]
    return any(indicator in response.lower() for indicator in refusal_indicators)


def check_mentions_keyword(response: str, keyword: str) -> bool:
    """Verifica se a resposta menciona uma palavra-chave específica."""
    return keyword.lower() in response.lower()


def check_expected_source(response: str, expected_source: str) -> bool:
    """Verifica se a fonte esperada é mencionada na resposta."""
    if expected_source is None:
        return True
    return expected_source in response


def run_test_case(
    client,
    system_prompt: str,
    test_case: dict,
    forbidden_terms: list[str],
    source_pattern: str,
) -> TestResult:
    """Executa um caso de teste e retorna o resultado."""
    question = test_case["question"]
    criteria = test_case["criteria"]
    checks = {}
    errors = []

    response = send_question(client, system_prompt, question)

    if criteria.get("must_contain_source_citation"):
        passed = check_source_citation(response, source_pattern)
        checks["citação_de_fonte"] = passed
        if not passed:
            errors.append("Resposta não contém citação de fonte no padrão esperado")

    if criteria.get("must_not_contain_forbidden_terms"):
        passed, found_terms = check_forbidden_terms(response, forbidden_terms)
        checks["sem_termos_proibidos"] = passed
        if not passed:
            errors.append(f"Termos proibidos encontrados: {found_terms}")

    if criteria.get("max_response_length"):
        passed = check_max_length(response, criteria["max_response_length"])
        checks["tamanho_resposta"] = passed
        if not passed:
            errors.append(
                f"Resposta excede {criteria['max_response_length']} caracteres "
                f"(tem {len(response)})"
            )

    if criteria.get("must_refuse_or_redirect"):
        passed = check_refusal(response)
        checks["recusa_adequada"] = passed
        if not passed:
            errors.append("Resposta não recusou pergunta fora do escopo")

    if criteria.get("must_mention_prazo"):
        passed = check_mentions_keyword(response, "prazo") or check_mentions_keyword(
            response, "dias"
        )
        checks["menciona_prazo"] = passed
        if not passed:
            errors.append("Resposta não menciona prazo ou dias")

    if criteria.get("must_contain_steps"):
        step_indicators = ["1.", "2.", "passo", "etapa", "primeiro", "segundo"]
        passed = any(ind in response.lower() for ind in step_indicators)
        checks["contém_passos"] = passed
        if not passed:
            errors.append("Resposta não contém passos/etapas do procedimento")

    if criteria.get("must_mention_hours_or_minutes"):
        passed = bool(re.search(r"\d+\s*(hora|minuto|h|min)", response.lower()))
        checks["menciona_tempo"] = passed
        if not passed:
            errors.append("Resposta não menciona horas ou minutos")

    if criteria.get("must_acknowledge_version_conflict"):
        conflict_indicators = ["versão", "atualiz", "substituí", "vigente", "mais recente"]
        passed = any(ind in response.lower() for ind in conflict_indicators)
        checks["reconhece_conflito_versão"] = passed
        if not passed:
            errors.append("Resposta não reconhece conflito entre versões")

    if criteria.get("must_not_hallucinate"):
        passed = not check_source_citation(response, source_pattern) or check_refusal(response)
        checks["não_alucina"] = passed
        if not passed:
            errors.append("Resposta pode conter alucinação (citou fonte para pergunta inválida)")

    if test_case.get("expected_source"):
        passed = check_expected_source(response, test_case["expected_source"])
        checks["fonte_correta"] = passed
        if not passed:
            errors.append(f"Fonte esperada '{test_case['expected_source']}' não encontrada")

    all_passed = all(checks.values())

    return TestResult(
        test_id=test_case["id"],
        question=question,
        response=response,
        passed=all_passed,
        checks=checks,
        errors=errors,
    )


def generate_report(results: list[TestResult]) -> str:
    """Gera relatório de execução dos testes."""
    total = len(results)
    passed = sum(1 for r in results if r.passed)
    failed = total - passed

    lines = [
        "=" * 60,
        "RELATÓRIO DE TESTE AUTOMATIZADO DE PROMPTS",
        f"Data: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "=" * 60,
        f"\nResumo: {passed}/{total} testes passaram | {failed} falharam\n",
    ]

    for result in results:
        status = "PASSOU ✓" if result.passed else "FALHOU ✗"
        lines.append(f"\n{'─' * 40}")
        lines.append(f"[{result.test_id}] {status}")
        lines.append(f"Pergunta: {result.question}")
        lines.append(f"Resposta (trecho): {result.response[:150]}...")
        lines.append("Verificações:")
        for check_name, check_passed in result.checks.items():
            icon = "  ✓" if check_passed else "  ✗"
            lines.append(f"  {icon} {check_name}")
        if result.errors:
            lines.append("Erros:")
            for error in result.errors:
                lines.append(f"    - {error}")

    lines.append(f"\n{'=' * 60}")
    lines.append(f"Taxa de aprovação: {passed/total*100:.1f}%")
    lines.append("=" * 60)

    return "\n".join(lines)


def main():
    dry_run = "--dry-run" in sys.argv

    config_path = "test_cases.json"
    for i, arg in enumerate(sys.argv):
        if arg == "--config" and i + 1 < len(sys.argv):
            config_path = sys.argv[i + 1]

    script_dir = Path(__file__).parent
    config_path = script_dir / config_path

    print(f"Carregando configuração de: {config_path}")
    config = load_config(config_path)

    client = None
    if not dry_run:
        client = get_llm_client()
        if client is None:
            print("Nenhuma API key configurada. Executando em modo dry-run.\n")
            dry_run = True

    if dry_run:
        print("MODO DRY-RUN: respostas serão simuladas.\n")

    results = []
    for test_case in config["test_cases"]:
        print(f"Executando {test_case['id']}: {test_case['question'][:50]}...")
        result = run_test_case(
            client=client,
            system_prompt=config["system_prompt"],
            test_case=test_case,
            forbidden_terms=config["forbidden_terms"],
            source_pattern=config["required_source_pattern"],
        )
        results.append(result)

    report = generate_report(results)
    print(report)

    report_path = script_dir / f"report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"\nRelatório salvo em: {report_path}")


if __name__ == "__main__":
    main()
