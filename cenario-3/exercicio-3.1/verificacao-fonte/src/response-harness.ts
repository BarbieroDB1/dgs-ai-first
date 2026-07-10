import {
  ModelStructuredResponseSchema,
  type ModelStructuredResponse
} from "./model-response-schema.js";
import {
  validateSourceDocument,
  type SourceDocumentValidationResult
} from "./source-document-validator.js";

export interface RejectionEvent {
  eventType: "MODEL_RESPONSE_REJECTED";
  reason: string;
  normalizedSource: string;
  createdAt: string;
}

export interface ProcessResult {
  shouldReturnToAttendant: boolean;
  sourceValidation: SourceDocumentValidationResult;
  parsedResponse?: ModelStructuredResponse;
  rejectionEvent?: RejectionEvent;
}

export interface ProcessOptions {
  onRejectionEvent?: (event: RejectionEvent) => void;
}

function buildRejectionEvent(reason: string, normalizedSource: string): RejectionEvent {
  return {
    eventType: "MODEL_RESPONSE_REJECTED",
    reason,
    normalizedSource,
    createdAt: new Date().toISOString()
  };
}

export function processModelResponse(rawResponse: unknown, options?: ProcessOptions): ProcessResult {
  const schemaResult = ModelStructuredResponseSchema.safeParse(rawResponse);

  if (!schemaResult.success) {
    const rejectionEvent = buildRejectionEvent("schema_validation_failed", "");
    options?.onRejectionEvent?.(rejectionEvent);

    return {
      shouldReturnToAttendant: false,
      sourceValidation: {
        isValid: false,
        reason: "schema_validation_failed",
        normalizedSource: ""
      },
      rejectionEvent
    };
  }

  const sourceValidation = validateSourceDocument(schemaResult.data);
  if (!sourceValidation.isValid) {
    const rejectionEvent = buildRejectionEvent(sourceValidation.reason, sourceValidation.normalizedSource);
    options?.onRejectionEvent?.(rejectionEvent);

    return {
      shouldReturnToAttendant: false,
      sourceValidation,
      parsedResponse: schemaResult.data,
      rejectionEvent
    };
  }

  return {
    shouldReturnToAttendant: true,
    sourceValidation,
    parsedResponse: schemaResult.data
  };
}
