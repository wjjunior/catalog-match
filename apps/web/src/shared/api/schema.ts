import type {
  Alternative,
  AttributeName,
  ConfidenceLabel,
  CustomerSummary,
  Diameter,
  Explanation,
  Finish,
  FinishFamily,
  Length,
  LengthUnit,
  Match,
  MatchedAttribute,
  MatchRequest,
  MatchResponse,
  MatchStatus,
  Material,
  MaterialFamily,
  Note,
  NoteCode,
  ParsedSpec,
  PersonalizationExplanation,
  ProductType,
  Provenance,
  ThreadSystem,
} from '@catalog-match/core';
import { z } from 'zod';

// A Record over the union forces every member to be listed, so a value added to the
// domain breaks compilation here instead of silently failing validation at runtime.
function literalsOf<T extends string>(members: Readonly<Record<T, true>>) {
  return z.enum(Object.keys(members) as [T, ...T[]]);
}

const threadSystem = literalsOf<ThreadSystem>({ metric: true, imperial: true, number: true });

const lengthUnit = literalsOf<LengthUnit>({ in: true, mm: true, ft: true });

const productType = literalsOf<ProductType>({
  hex_cap_screw: true,
  socket_head_cap_screw: true,
  button_socket_cap_screw: true,
  pan_machine_screw: true,
  lag_screw: true,
  tap_bolt: true,
  threaded_rod: true,
  hex_nut: true,
  flat_washer: true,
  lock_washer: true,
});

const material = literalsOf<Material | MaterialFamily>({
  steel: true,
  ss_18_8: true,
  ss_316: true,
  ss_a2: true,
  brass: true,
  alloy: true,
  stainless: true,
});

const finish = literalsOf<Finish | FinishFamily>({
  zinc: true,
  yellow_zinc: true,
  mech_zinc: true,
  hdg: true,
  plain: true,
  black_oxide: true,
  zinc_family: true,
});

const attributeName = literalsOf<AttributeName>({
  diameter: true,
  pitch: true,
  length: true,
  type: true,
  material: true,
  finish: true,
  standard: true,
});

const provenance = literalsOf<Provenance>({
  explicit: true,
  inferred: true,
  corrected: true,
  approximate: true,
  unrecognized: true,
});

const matchStatus = literalsOf<MatchStatus>({
  unique: true,
  ambiguous: true,
  none: true,
  history: true,
  unparsed: true,
});

const noteCode = literalsOf<NoteCode>({
  failedConstraint: true,
  unknownDiameter: true,
  unknownType: true,
  unitMismatch: true,
  discontinued: true,
  customerRequired: true,
  historyReference: true,
  unverifiedResidue: true,
  unboundLength: true,
  unrankedPool: true,
});

const confidenceLabel = literalsOf<ConfidenceLabel>({ High: true, Medium: true, Low: true });

const weighted = <T extends z.ZodType>(value: T) => z.object({ value, strength: z.number() });

const diameter: z.ZodType<Diameter, unknown> = z.object({
  system: threadSystem,
  nominal: z.string(),
  mm: z.number(),
  known: z.boolean(),
});

const length: z.ZodType<Length, unknown> = z.object({
  value: z.number(),
  unit: lengthUnit,
  mm: z.number(),
});

const parsedSpec: z.ZodType<ParsedSpec, unknown> = z.object({
  diameter: diameter.optional(),
  pitch: z.string().optional(),
  length: length.optional(),
  type: z.array(weighted(productType)).optional(),
  material: weighted(material).optional(),
  finish: weighted(finish).optional(),
  standard: z.string().optional(),
  residue: z.array(z.string()),
  evidence: z.partialRecord(attributeName, z.string()),
  provenance: z.partialRecord(attributeName, provenance),
});

const matchedAttribute: z.ZodType<MatchedAttribute, unknown> = z.object({
  attr: attributeName,
  query: z.string(),
  item: z.string(),
  provenance,
  partial: z.boolean().optional(),
});

const personalization: z.ZodType<PersonalizationExplanation, unknown> = z.object({
  reason: z.string(),
  prior: z.number(),
  overriddenBy: z.array(attributeName).optional(),
});

const explanation: z.ZodType<Explanation, unknown> = z.object({
  matched: z.array(matchedAttribute),
  unspecified: z.array(attributeName),
  unverified: z.array(z.string()),
  compatibleCount: z.number(),
  disambiguateBy: z.array(attributeName),
  relaxed: z.array(z.string()).optional(),
  closeness: z.number().optional(),
  personalization: personalization.optional(),
});

const match: z.ZodType<Match, unknown> = z.object({
  sku: z.string(),
  catalogId: z.string(),
  description: z.string(),
  active: z.boolean(),
  confidence: z.number(),
  label: confidenceLabel.optional(),
  explanation,
  components: z.object({ compatibility: z.number(), prior: z.number() }),
});

const alternative: z.ZodType<Alternative, unknown> = z.object({
  sku: z.string(),
  catalogId: z.string(),
  description: z.string(),
  active: z.boolean(),
  closeness: z.number(),
  relaxed: z.array(z.string()),
  explanation,
});

const note: z.ZodType<Note, unknown> = z.object({ code: noteCode, message: z.string() });

const customerSummary: z.ZodType<CustomerSummary, unknown> = z.object({
  customerId: z.string(),
  customerName: z.string(),
  orderCount: z.number(),
  lastOrderDate: z.string(),
});

export const matchRequestSchema = z.object({
  query: z.string().trim().min(1),
  customerId: z.string().trim().min(1).optional(),
  limit: z.int().min(1).max(10).default(3),
}) satisfies z.ZodType<MatchRequest, unknown>;

export const matchResponseSchema: z.ZodType<MatchResponse, unknown> = z.object({
  query: z.string(),
  parsed: parsedSpec,
  status: matchStatus,
  compatibleCount: z.number(),
  results: z.array(match),
  alternatives: z.array(alternative),
  notes: z.array(note),
  timingsMs: z.object({ parse: z.number(), match: z.number() }),
});

export const customersResponseSchema: z.ZodType<CustomerSummary[], unknown> =
  z.array(customerSummary);

export const errorResponseSchema = z.object({ error: z.string() });

export type MatchRequestBody = z.infer<typeof matchRequestSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
