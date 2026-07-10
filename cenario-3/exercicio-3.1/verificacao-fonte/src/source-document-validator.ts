import { OFFICIAL_SHORT_SOURCES_SET } from "./official-sources.js";

export interface SourceDocumentValidationResult {
  isValid: boolean;
  reason: string;
  normalizedSource: string;
}

export type SourceDocumentCarrier = {
  source_document?: unknown;
};

export function validateSourceDocument(
  response: SourceDocumentCarrier | null | undefined
): SourceDocumentValidationResult {
  if (!response || typeof response !== "object") {
    return {
      isValid: false,
      reason: "missing_response_object",
      normalizedSource: ""
    };
  }

  const source = response.source_document;
  if (typeof source !== "string") {
    return {
      isValid: false,
      reason: "missing_source_document",
      normalizedSource: ""
    };
  }

  const normalizedSource = source.trim();
  if (!normalizedSource) {
    return {
      isValid: false,
      reason: "empty_source_document",
      normalizedSource
    };
  }

  if (!OFFICIAL_SHORT_SOURCES_SET.has(normalizedSource)) {
    return {
      isValid: false,
      reason: "source_document_not_in_allowlist",
      normalizedSource
    };
  }

  return {
    isValid: true,
    reason: "valid_source_document",
    normalizedSource
  };
}
