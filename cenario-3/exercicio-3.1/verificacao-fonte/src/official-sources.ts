export const OFFICIAL_SHORT_SOURCES = [
  "POL-001",
  "PROC-042",
  "PROC-042-v2",
  "SLA-2024",
  "FAQ-Atendimento"
] as const;

export type OfficialShortSource = (typeof OFFICIAL_SHORT_SOURCES)[number];

export const OFFICIAL_SHORT_SOURCES_SET = new Set<string>(OFFICIAL_SHORT_SOURCES);
