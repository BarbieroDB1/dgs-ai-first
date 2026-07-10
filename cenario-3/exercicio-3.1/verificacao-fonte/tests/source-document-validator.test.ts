import { describe, expect, it, vi } from "vitest";

import { processModelResponse } from "../src/response-harness.js";
import { validateSourceDocument } from "../src/source-document-validator.js";

describe("validateSourceDocument", () => {
  it("case 1: should accept POL-001", () => {
    const result = validateSourceDocument({ source_document: "POL-001" });

    expect(result.isValid).toBe(true);
    expect(result.reason).toBe("valid_source_document");
    expect(result.normalizedSource).toBe("POL-001");
  });

  it("case 2: should accept PROC-042-v2", () => {
    const result = validateSourceDocument({ source_document: "PROC-042-v2" });

    expect(result.isValid).toBe(true);
    expect(result.reason).toBe("valid_source_document");
    expect(result.normalizedSource).toBe("PROC-042-v2");
  });

  it("case 3: should reject SLA 2024 (missing hyphen)", () => {
    const result = validateSourceDocument({ source_document: "SLA 2024" });

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe("source_document_not_in_allowlist");
    expect(result.normalizedSource).toBe("SLA 2024");
  });

  it("case 4: should reject Documento de SLA", () => {
    const result = validateSourceDocument({ source_document: "Documento de SLA" });

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe("source_document_not_in_allowlist");
    expect(result.normalizedSource).toBe("Documento de SLA");
  });

  it("case 5: should reject when source_document is missing", () => {
    const result = validateSourceDocument({});

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe("missing_source_document");
    expect(result.normalizedSource).toBe("");
  });

  it("should normalize leading/trailing spaces before comparing", () => {
    const result = validateSourceDocument({ source_document: "  FAQ-Atendimento  " });

    expect(result.isValid).toBe(true);
    expect(result.reason).toBe("valid_source_document");
    expect(result.normalizedSource).toBe("FAQ-Atendimento");
  });
});

describe("processModelResponse", () => {
  it("should block the answer and emit a rejection event for invalid source_document", () => {
    const onRejectionEvent = vi.fn();

    const result = processModelResponse(
      {
        answer: "Resposta de teste",
        source_document: "Documento de SLA",
        confidence_score: 0.88
      },
      { onRejectionEvent }
    );

    expect(result.shouldReturnToAttendant).toBe(false);
    expect(result.sourceValidation.isValid).toBe(false);
    expect(result.rejectionEvent?.eventType).toBe("MODEL_RESPONSE_REJECTED");
    expect(result.rejectionEvent?.reason).toBe("source_document_not_in_allowlist");
    expect(onRejectionEvent).toHaveBeenCalledTimes(1);
  });

  it("should block the answer when schema validation fails", () => {
    const result = processModelResponse({
      answer: "sem confidence",
      source_document: "POL-001"
    });

    expect(result.shouldReturnToAttendant).toBe(false);
    expect(result.sourceValidation.reason).toBe("schema_validation_failed");
    expect(result.rejectionEvent?.eventType).toBe("MODEL_RESPONSE_REJECTED");
  });

  it("should allow response when schema and source_document are valid", () => {
    const result = processModelResponse({
      answer: "Prazo geral de devolucao e 7 dias corridos.",
      source_document: "POL-001",
      confidence_score: 0.91
    });

    expect(result.shouldReturnToAttendant).toBe(true);
    expect(result.sourceValidation.isValid).toBe(true);
    expect(result.rejectionEvent).toBeUndefined();
  });
});
