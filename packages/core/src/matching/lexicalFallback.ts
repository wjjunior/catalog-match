import type { CatalogItem } from '../domain/catalog';
import type { Match, MatchRequest, MatchResponse, MatchStatus } from '../domain/match';
import type { ParsedSpec } from '../domain/spec';
import { correct } from '../parsing/fuzzy';
import { normalize } from '../parsing/normalize';
import type { MatcherConfig } from './config';
import { DEFAULT_MATCHER_CONFIG } from './config';
import type { ExplanationMeta } from './explainer';
import { explainMatch, unverifiedResidueNote } from './explainer';

const K1 = 1.2;
const B = 0.75;

export interface LexicalIndex {
  readonly items: readonly CatalogItem[];
  readonly termFrequencies: readonly ReadonlyMap<string, number>[];
  readonly lengths: readonly number[];
  readonly documentFrequency: ReadonlyMap<string, number>;
  readonly averageLength: number;
  readonly size: number;
}

export interface ScoredSku {
  sku: string;
  score: number;
}

function countTerms(description: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of normalize(description).tokens) {
    counts.set(token.text, (counts.get(token.text) ?? 0) + 1);
  }
  return counts;
}

export function buildIndex(items: readonly CatalogItem[]): LexicalIndex {
  const termFrequencies = items.map((item) => countTerms(item.description));
  const lengths = termFrequencies.map((counts) => [...counts.values()].reduce((a, b) => a + b, 0));
  const documentFrequency = new Map<string, number>();

  for (const counts of termFrequencies) {
    for (const term of counts.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const total = lengths.reduce((a, b) => a + b, 0);

  return {
    items,
    termFrequencies,
    lengths,
    documentFrequency,
    averageLength: items.length === 0 ? 0 : total / items.length,
    size: items.length,
  };
}

/** The Lucene form rather than the textbook one, which goes negative for a term held by
 * more than half the catalog: `ss` is in 480 of 1000 rows and must never subtract. */
function inverseDocumentFrequency(index: LexicalIndex, term: string): number {
  const held = index.documentFrequency.get(term);
  if (held === undefined) return 0;
  return Math.log(1 + (index.size - held + 0.5) / (held + 0.5));
}

/** Scores relative to the best hit, so a caller can cap them without knowing how long the
 * descriptions happen to be. Documents no query term reaches are absent, not zero. */
export function score(index: LexicalIndex, queryTokens: readonly string[]): ScoredSku[] {
  const idf = new Map(queryTokens.map((term) => [term, inverseDocumentFrequency(index, term)]));
  const ranked: ScoredSku[] = [];

  for (const [document, counts] of index.termFrequencies.entries()) {
    const normalizer = K1 * (1 - B + (B * (index.lengths[document] ?? 0)) / index.averageLength);
    let total = 0;

    for (const term of queryTokens) {
      const frequency = counts.get(term) ?? 0;
      if (frequency === 0) continue;
      total += (idf.get(term) ?? 0) * ((frequency * (K1 + 1)) / (frequency + normalizer));
    }

    if (total > 0) ranked.push({ sku: index.items[document]?.sku ?? '', score: total });
  }

  const best = ranked.reduce((highest, entry) => Math.max(highest, entry.score), 0);
  for (const entry of ranked) entry.score /= best;

  // Code units, not `localeCompare`: the latter follows the runner's locale, and
  // Lithuanian collates `Y` between `I` and `J`, which would reorder tied skus.
  return ranked.sort((a, b) => b.score - a.score || (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0));
}

/** The baseline of docs/DESIGN.md 10.4: the same scoring the parser falls back to, run
 * alone so the parse-and-score hypothesis has something to be measured against. */
export class LexicalOnlyMatcher {
  private readonly bySku: ReadonlyMap<string, CatalogItem>;

  constructor(
    private readonly index: LexicalIndex,
    private readonly config: MatcherConfig = DEFAULT_MATCHER_CONFIG,
  ) {
    this.bySku = new Map(index.items.map((item) => [item.sku, item]));
  }

  match(request: MatchRequest): MatchResponse {
    const parseStart = performance.now();
    const residue = normalize(request.query).tokens.map((token) => token.text);
    const queryTokens = residue.map((token) => correct(token)?.word ?? token);
    const parse = performance.now() - parseStart;

    const matchStart = performance.now();
    const ranked = score(this.index, queryTokens);
    const match = performance.now() - matchStart;

    const parsed: ParsedSpec = { residue, evidence: {}, provenance: {} };
    const meta = { compatibleCount: ranked.length, disambiguateBy: [] };

    return {
      query: request.query,
      parsed,
      status: this.statusFor(ranked),
      compatibleCount: ranked.length,
      results: ranked
        .slice(0, request.limit ?? 3)
        .flatMap((entry) => this.matchFor(entry, parsed, meta)),
      alternatives: [],
      notes: residue.length === 0 ? [] : [unverifiedResidueNote(residue)],
      timingsMs: { parse, match },
    };
  }

  private matchFor(entry: ScoredSku, parsed: ParsedSpec, meta: ExplanationMeta): Match[] {
    const item = this.bySku.get(entry.sku);
    if (item === undefined) return [];

    return [
      {
        sku: item.sku,
        catalogId: item.catalogId,
        description: item.description,
        active: item.active,
        confidence: this.config.lexicalCap * entry.score,
        explanation: explainMatch(parsed, item, meta),
        components: { compatibility: entry.score, prior: 1 },
      },
    ];
  }

  private statusFor(ranked: readonly ScoredSku[]): MatchStatus {
    if (ranked.length === 0) return 'none';
    return 1 - (ranked[1]?.score ?? 0) >= this.config.lexicalUniqueGap ? 'unique' : 'ambiguous';
  }
}
