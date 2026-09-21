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

const isStatus = (value: unknown): value is MatchStatus =>
  MATCH_STATUSES.includes(value as MatchStatus);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export function parseEvalCase(value: unknown, where: string): EvalCase {
  const reject = (reason: string): never => {
    throw new EvalSchemaError(`${where}: ${reason}`);
  };

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return reject('expected a JSON object');
  }
  const row = value as Record<string, unknown>;

  const { id, query, customerId, expectedStatus, expected, tags, rationale } = row;
  const { expectedTop1, expectedAlternatives } = row;

  if (typeof id !== 'string' || id === '') reject('id must be a non-empty string');
  if (typeof query !== 'string' || query === '') reject('query must be a non-empty string');
  if (customerId !== undefined && typeof customerId !== 'string') {
    reject('customerId must be a string when present');
  }
  if (!isStatus(expectedStatus)) {
    reject(`expectedStatus must be one of ${MATCH_STATUSES.join(', ')}`);
  }
  if (!isStringArray(expected)) reject('expected must be an array of SKU strings');
  if (expectedTop1 !== undefined && (typeof expectedTop1 !== 'string' || expectedTop1 === '')) {
    reject('expectedTop1 must be a non-empty string when present');
  }
  if (expectedAlternatives !== undefined && !isStringArray(expectedAlternatives)) {
    reject('expectedAlternatives must be an array of SKU strings when present');
  }
  if (!isStringArray(tags)) reject('tags must be an array of strings');
  if (rationale !== undefined && typeof rationale !== 'string') {
    reject('rationale must be a string when present');
  }

  const known = new Set([
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
  const unknown = Object.keys(row).filter((key) => !known.has(key));
  if (unknown.length > 0) reject(`unknown field(s): ${unknown.sort().join(', ')}`);

  return {
    id: id as string,
    query: query as string,
    ...(customerId === undefined ? {} : { customerId: customerId as string }),
    expectedStatus: expectedStatus as MatchStatus,
    expected: expected as string[],
    ...(expectedTop1 === undefined ? {} : { expectedTop1: expectedTop1 as string }),
    ...(expectedAlternatives === undefined
      ? {}
      : { expectedAlternatives: expectedAlternatives as string[] }),
    tags: tags as string[],
    ...(rationale === undefined ? {} : { rationale: rationale as string }),
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
