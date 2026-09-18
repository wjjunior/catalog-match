import { z } from 'zod';

export const EVAL_STATUSES = ['unique', 'ambiguous', 'none', 'history', 'unparsed'] as const;

export const EVAL_TAGS = [
  'example',
  'personalized',
  'adversarial',
  'tie',
  'discontinued',
  'history-reference',
  'override',
  'status-only',
  'unknown-diameter',
  'unknown-type',
  'unknown-length',
  'residue',
  'synonym',
  'unit-form',
  'typo',
  'noise',
  'casing',
  'permutation',
  'standard',
] as const;

const unique = <T>(values: readonly T[]): boolean => new Set(values).size === values.length;

export const EvalCase = z
  .object({
    id: z.string().regex(/^(ex|pers|adv)-\d{2}$/),
    query: z.string().min(1),
    customerId: z
      .string()
      .regex(/^CUST-\d{3}$/)
      .nullable(),
    expectedStatus: z.enum(EVAL_STATUSES),
    expected: z.array(z.string().min(1)),
    expectedTop1: z.string().min(1).optional(),
    expectedAlternatives: z.array(z.string().min(1)).optional(),
    tags: z.array(z.enum(EVAL_TAGS)).min(1),
    rationale: z.string().optional(),
  })
  .superRefine((row, ctx) => {
    const fail = (message: string, path: string) =>
      ctx.addIssue({ code: 'custom', message, path: [path] });

    const statusOnly = row.tags.includes('status-only');

    if (row.expectedStatus === 'unique' && row.expected.length !== 1)
      fail('a unique row names exactly one SKU', 'expected');
    if (row.expectedStatus === 'ambiguous') {
      if (statusOnly && row.expected.length !== 0)
        fail('a status-only row carries no set', 'expected');
      if (!statusOnly && row.expected.length < 2)
        fail('an ambiguous row names the whole compatible set', 'expected');
    }
    if (
      (row.expectedStatus === 'none' || row.expectedStatus === 'unparsed') &&
      row.expected.length !== 0
    )
      fail('nothing is expected when nothing matched or nothing parsed', 'expected');
    if (row.expectedStatus === 'history') {
      if (row.customerId === null && row.expected.length !== 0)
        fail('a history reference without a customer resolves to nothing', 'expected');
      if (row.customerId !== null && row.expected.length === 0)
        fail('a history reference with a customer names the referenced SKUs', 'expected');
    }

    if (row.expectedTop1 !== undefined && !row.expected.includes(row.expectedTop1))
      fail('expectedTop1 must be one of the expected SKUs', 'expectedTop1');

    if (row.customerId !== null && (row.rationale === undefined || row.rationale.trim() === ''))
      fail('every personalized case carries a hand-written rationale', 'rationale');

    if (row.expectedAlternatives !== undefined && row.expectedStatus !== 'none')
      fail('alternatives exist only when nothing matched', 'expectedAlternatives');

    if (!unique(row.expected)) fail('duplicate SKU', 'expected');
    if (row.expectedAlternatives !== undefined && !unique(row.expectedAlternatives))
      fail('duplicate SKU', 'expectedAlternatives');
    if (!unique(row.tags)) fail('duplicate tag', 'tags');
  });

export type EvalCase = z.infer<typeof EvalCase>;
