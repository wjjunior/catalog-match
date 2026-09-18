import type { Alternative, Match, MatchRequest, MatchResponse, Note } from '../domain/match';
import type { AttributeName, ParsedSpec } from '../domain/spec';
import type { CatalogItem } from '../domain/catalog';
import {
  alternatives,
  compatibleSet,
  deriveStatus,
  disambiguateBy,
  failedConstraint,
} from '../matching/compatibility';
import type { MatcherConfig } from '../matching/config';
import { DEFAULT_MATCHER_CONFIG } from '../matching/config';
import type { ExplanationMeta } from '../matching/explainer';
import {
  customerRequiredNote,
  explainAlternative,
  explainMatch,
  failedConstraintNote,
  unitMismatchNote,
  unknownDiameterNote,
  unverifiedResidueNote,
} from '../matching/explainer';
import type { LexicalIndex } from '../matching/lexicalFallback';
import { score } from '../matching/lexicalFallback';
import { labelFor, posterior, uniformPrior } from '../matching/posterior';
import { compatibility } from '../matching/ranking';
import { correct } from '../parsing/fuzzy';
import { normalize } from '../parsing/normalize';
import type { QueryParse } from '../parsing/queryParser';
import { parseQuery } from '../parsing/queryParser';
import { unitMismatch } from '../parsing/units';
import type { CatalogRepository } from '../ports/catalogRepository';

export interface MatchQueryDeps {
  readonly catalog: CatalogRepository;
  readonly index: LexicalIndex;
  readonly config?: MatcherConfig;
}

/** The response minus what every branch answers the same way. */
type Answer = Omit<MatchResponse, 'query' | 'parsed' | 'timingsMs'>;

const DEFAULT_LIMIT = 3;

const bySku = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The thresholds are placeholders until PRG-36 measures them, and a response carrying a
 * label promises one. docs/DESIGN.md 5.5. */
function labelled(match: Match, config: MatcherConfig): Match {
  if (config.labels.provisional) return match;

  return { ...match, label: labelFor(match.confidence, config).label };
}

function diagnosis(spec: ParsedSpec, failed: AttributeName): Note {
  if (failed === 'diameter' && spec.diameter?.known === false) {
    return unknownDiameterNote(spec.diameter.nominal);
  }

  return failedConstraintNote(spec, failed);
}

/** How the query was read, then what failed, then what could not be verified. */
function notesFor(spec: ParsedSpec, failure: Note | undefined): Note[] {
  const notes: Note[] = [];

  if (spec.diameter && spec.length && unitMismatch(spec.diameter, spec.length)) {
    notes.push(unitMismatchNote(spec.diameter, spec.length));
  }
  if (failure !== undefined) notes.push(failure);
  if (spec.residue.length > 0) notes.push(unverifiedResidueNote(spec.residue));

  return notes;
}

function ranked(
  status: Answer['status'],
  spec: ParsedSpec,
  compatible: readonly CatalogItem[],
  config: MatcherConfig,
  limit: number,
): Answer {
  const s = compatible.map((item) => compatibility(spec, item, config));
  const prior = uniformPrior(compatible);
  const { p } = posterior(compatible, s, prior, spec.residue.length, config);

  const meta: ExplanationMeta = {
    compatibleCount: compatible.length,
    disambiguateBy: disambiguateBy(compatible),
  };

  // The repositories key the catalog by SKU and `posterior` keys its distribution the
  // same way, so a SKU cannot reach this twice. The tie-break restates the order C
  // already has, so the ranking never depends on another module's sort staying stable.
  const results = compatible
    .map((item, index) => ({
      item,
      confidence: p.get(item.sku) ?? 0,
      components: { compatibility: s[index] ?? 0, prior: prior[index] ?? 0 },
    }))
    .sort((a, b) => b.confidence - a.confidence || bySku(a.item.sku, b.item.sku))
    .slice(0, limit)
    .map(({ item, confidence, components }) =>
      labelled(
        {
          sku: item.sku,
          catalogId: item.catalogId,
          description: item.description,
          active: item.active,
          confidence,
          explanation: explainMatch(spec, item, meta),
          components,
        },
        config,
      ),
    );

  return {
    status,
    compatibleCount: compatible.length,
    results,
    alternatives: [],
    notes: notesFor(spec, undefined),
  };
}

function none(
  spec: ParsedSpec,
  items: readonly CatalogItem[],
  config: MatcherConfig,
  limit: number,
): Answer {
  const failed = failedConstraint(spec, items);

  const found: Alternative[] = alternatives(spec, items, config)
    .slice(0, limit)
    .map(({ item, closeness, relaxed }) => ({
      sku: item.sku,
      catalogId: item.catalogId,
      description: item.description,
      active: item.active,
      closeness,
      relaxed: [...relaxed],
      explanation: explainAlternative(spec, item, relaxed, closeness),
    }));

  return {
    status: 'none',
    compatibleCount: 0,
    results: [],
    alternatives: found,
    notes: notesFor(spec, failed === undefined ? undefined : diagnosis(spec, failed)),
  };
}

/** docs/DESIGN.md 5.8. There is no compatible set to report: the constraints the parser
 * did find are too weak to name one, which is what `unparsed` says. */
function unparsed(
  query: string,
  spec: ParsedSpec,
  deps: MatchQueryDeps,
  config: MatcherConfig,
  limit: number,
): Answer {
  // The same tokens the baseline scores (matching/lexicalFallback.ts), so the comparison
  // of docs/DESIGN.md 10.4 stays one of parsing against scoring, not of two tokenizers.
  const tokens = normalize(query).tokens.map((token) => correct(token.text)?.word ?? token.text);
  const meta: ExplanationMeta = { compatibleCount: 0, disambiguateBy: [] };

  const results = score(deps.index, tokens)
    .slice(0, limit)
    .flatMap((entry) => {
      const item = deps.catalog.bySku(entry.sku);
      if (item === undefined) return [];

      return [
        labelled(
          {
            sku: item.sku,
            catalogId: item.catalogId,
            description: item.description,
            active: item.active,
            confidence: config.lexicalCap * entry.score,
            explanation: explainMatch(spec, item, meta),
            // Token overlap is all the evidence there is, and no customer is known yet.
            components: { compatibility: entry.score, prior: 1 },
          },
          config,
        ),
      ];
    });

  return {
    status: 'unparsed',
    compatibleCount: 0,
    results,
    alternatives: [],
    notes: notesFor(spec, undefined),
  };
}

/** `same` and `last time` both fire on "the same washers as last time"; the longer phrase
 * names the reference the rep has to resolve. */
const mostSpecific = (phrases: readonly string[]): string =>
  phrases.reduce((best, phrase) => (phrase.length > best.length ? phrase : best));

function answerFor(
  request: MatchRequest,
  parse: QueryParse,
  deps: MatchQueryDeps,
  config: MatcherConfig,
): Answer {
  const { spec, intentCandidates } = parse;
  const limit = request.limit ?? DEFAULT_LIMIT;

  // Intent routing arrives with personalization (PRG-26). Without a customer there is
  // nothing to route to, and the documented answer is the prompt. docs/DESIGN.md 7.4.
  if (intentCandidates.length > 0 && request.customerId === undefined) {
    return {
      status: 'history',
      compatibleCount: 0,
      results: [],
      alternatives: [],
      notes: [customerRequiredNote(mostSpecific(intentCandidates))],
    };
  }

  const items = deps.catalog.active();
  const compatible = compatibleSet(spec, items);
  const status = deriveStatus(spec, compatible);

  if (status === 'unparsed') return unparsed(request.query, spec, deps, config, limit);
  if (status === 'none') return none(spec, items, config, limit);

  return ranked(status, spec, compatible, config, limit);
}

export function matchQuery(deps: MatchQueryDeps): (request: MatchRequest) => MatchResponse {
  const config = deps.config ?? DEFAULT_MATCHER_CONFIG;

  return (request) => {
    const startedAt = performance.now();
    const parse = parseQuery(request.query);
    const parsedAt = performance.now();
    const answer = answerFor(request, parse, deps, config);

    return {
      query: request.query,
      parsed: parse.spec,
      ...answer,
      timingsMs: { parse: parsedAt - startedAt, match: performance.now() - parsedAt },
    };
  };
}
