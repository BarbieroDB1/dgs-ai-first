import { z } from "zod";

export const ModelStructuredResponseSchema = z.object({
  answer: z.string().min(1),
  source_document: z.string().min(1),
  confidence_score: z.number().min(0).max(1)
});

export type ModelStructuredResponse = z.infer<typeof ModelStructuredResponseSchema>;
