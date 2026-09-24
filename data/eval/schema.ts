// Structure only: which expected sizes go with which status is a property of each set,
// not of the schema. docs/BRIEF.md 11.

export const MATCH_STATUSES = ['unique', 'ambiguous', 'none', 'history', 'unparsed'] as const;

export type MatchStatus = (typeof MATCH_STATUSES)[number];

export type EvalCase = {
  id: string;
  query: string;
  customerId?: string;
  expectedStatus: MatchStatus;
  expected: string[];
  /** The SKU that must rank first, where one exists. A personalized tie query needs both:
   * its status comes from the whole set, its intended answer is a single item. */
  expectedTop1?: string;
  expectedAlternatives?: string[];
  tags: string[];
  rationale?: string;
};

// Case, whitespace and separators carry no meaning in a query, so two queries differing
// only there are the same query. This is the comparison behind the rule that the held-out
// set and the golden set share none.
export const normalizeQuery = (query: string): string =>
  query.toLowerCase().replace(/[^a-z0-9]/g, '');

export class EvalSchemaError extends Error {}

type Reject = (reason: string) => never;

const KNOWN_FIELDS = new Set([
  'id',
  'query',
  'customerId',
  'expectedStatus',
  'expected',
  'expectedTop1',
  'expectedAlternatives',
  'tags',
  'rationale',
]);

const isStatus = (value: unknown): value is MatchStatus =>
  MATCH_STATUSES.includes(value as MatchStatus);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const include = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
  value === undefined ? {} : ({ [key]: value } as Partial<Record<K, V>>);

function asObject(value: unknown, reject: Reject): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return reject('expected a JSON object');
  }

  return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, message: string, reject: Reject): string {
  if (typeof value !== 'string' || value === '') reject(message);

  return value;
}

function optionalString(value: unknown, message: string, reject: Reject): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') reject(message);

  return value;
}

function requireStringArray(value: unknown, message: string, reject: Reject): string[] {
  if (!isStringArray(value)) reject(message);

  return value;
}

function optionalStringArray(
  value: unknown,
  message: string,
  reject: Reject,
): string[] | undefined {
  if (value === undefined) return undefined;

  return requireStringArray(value, message, reject);
}

function requireStatus(value: unknown, reject: Reject): MatchStatus {
  if (!isStatus(value)) {
    reject(`expectedStatus must be one of ${MATCH_STATUSES.join(', ')}`);
  }

  return value;
}

function rejectUnknownFields(row: Record<string, unknown>, reject: Reject): void {
  const unknown = Object.keys(row)
    .filter((key) => !KNOWN_FIELDS.has(key))
    .toSorted();

  if (unknown.length > 0) reject(`unknown field(s): ${unknown.join(', ')}`);
}

export function parseEvalCase(value: unknown, where: string): EvalCase {
  const reject: Reject = (reason) => {
    throw new EvalSchemaError(`${where}: ${reason}`);
  };

  const row = asObject(value, reject);

  const id = requireNonEmptyString(row.id, 'id must be a non-empty string', reject);
  const query = requireNonEmptyString(row.query, 'query must be a non-empty string', reject);
  const customerId = optionalString(
    row.customerId,
    'customerId must be a string when present',
    reject,
  );
  const expectedStatus = requireStatus(row.expectedStatus, reject);
  const expected = requireStringArray(
    row.expected,
    'expected must be an array of SKU strings',
    reject,
  );
  const expectedTop1 =
    row.expectedTop1 === undefined
      ? undefined
      : requireNonEmptyString(
          row.expectedTop1,
          'expectedTop1 must be a non-empty string when present',
          reject,
        );
  const expectedAlternatives = optionalStringArray(
    row.expectedAlternatives,
    'expectedAlternatives must be an array of SKU strings when present',
    reject,
  );
  const tags = requireStringArray(row.tags, 'tags must be an array of strings', reject);
  const rationale = optionalString(
    row.rationale,
    'rationale must be a string when present',
    reject,
  );

  rejectUnknownFields(row, reject);

  return {
    id,
    query,
    ...include('customerId', customerId),
    expectedStatus,
    expected,
    ...include('expectedTop1', expectedTop1),
    ...include('expectedAlternatives', expectedAlternatives),
    tags,
    ...include('rationale', rationale),
  };
}

export function parseEvalJsonl(text: string): EvalCase[] {
  return text
    .split('\n')
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter((entry) => entry.line !== '')
    .map((entry) => {
      let value: unknown;
      try {
        value = JSON.parse(entry.line);
      } catch (cause) {
        throw new EvalSchemaError(`line ${entry.number}: invalid JSON`, { cause });
      }
      return parseEvalCase(value, `line ${entry.number}`);
    });
}
