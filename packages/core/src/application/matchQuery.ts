import type { Alternative, Match, MatchRequest, MatchResponse, Note } from '../domain/match';
import type { AttributeName, ParsedSpec } from '../domain/spec';
import type { CatalogItem, CustomerProfile } from '../domain/catalog';
import {
  alternatives,
  compatibleSet,
  deriveStatus,
  disambiguateBy,
  failedConstraint,
} from '../matching/compatibility';
import type { MatcherConfig } from '../matching/config';
import { DEFAULT_MATCHER_CONFIG } from '../matching/config';
import type { AttributeChange, ExplanationMeta } from '../matching/explainer';
import {
  customerRequiredNote,
  discontinuedNote,
  explainAlternative,
  explainMatch,
  failedConstraintNote,
  formatFinish,
  formatLength,
  formatMaterial,
  historyReferenceNote,
  orderedReason,
  unitMismatchNote,
  unknownDiameterNote,
  unknownTypeNote,
  unverifiedResidueNote,
  withPersonalization,
} from '../matching/explainer';
import type { LexicalIndex } from '../matching/lexicalFallback';
import { score } from '../matching/lexicalFallback';
import { labelFor, posterior } from '../matching/posterior';
import { compatibility } from '../matching/ranking';
import { correct } from '../parsing/fuzzy';
import { normalize } from '../parsing/normalize';
import type { QueryParse } from '../parsing/queryParser';
import { parseQuery } from '../parsing/queryParser';
import { unitMismatch } from '../parsing/units';
import {
  detectIntent,
  historyPrior,
  personalize,
  resolveReference,
  statesOverride,
  type ReferencedLine,
} from '../personalization';
import type { CatalogRepository } from '../ports/catalogRepository';
import type { OrderHistoryRepository } from '../ports/orderHistoryRepository';

export interface MatchQueryDeps {
  readonly catalog: CatalogRepository;
  readonly index: LexicalIndex;
  readonly config?: MatcherConfig;
  /** Both are absent for a matcher wired without a customer to speak of, which is what
   * the eval harness and the base tests use. */
  readonly history?: OrderHistoryRepository;
  readonly profile?: (customerId: string) => CustomerProfile | undefined;
}

type Answer = Omit<MatchResponse, 'query' | 'parsed' | 'timingsMs'>;

const DEFAULT_LIMIT = 3;

const bySku = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A response carrying a label promises one, so an unmeasured threshold must not reach
 * the caller. docs/DESIGN.md 5.5. */
function labelled(match: Match, config: MatcherConfig): Match {
  if (config.labels.provisional) return match;

  return { ...match, label: labelFor(match.confidence, config).label };
}

function diagnosis(spec: ParsedSpec, failed: AttributeName): Note {
  if (failed === 'diameter' && spec.diameter?.known === false) {
    return unknownDiameterNote(spec.diameter.nominal);
  }

  if (failed === 'type' && spec.provenance.type === 'unrecognized') {
    return unknownTypeNote(spec.evidence.type ?? '');
  }

  return failedConstraintNote(spec, failed);
}

function notesFor(spec: ParsedSpec, failure: Note | undefined): Note[] {
  const notes: Note[] = [];

  if (spec.diameter && spec.length && unitMismatch(spec.diameter, spec.length)) {
    notes.push(unitMismatchNote(spec.diameter, spec.length));
  }
  if (failure !== undefined) notes.push(failure);
  if (spec.residue.length > 0) notes.push(unverifiedResidueNote(spec.residue));

  return notes;
}

/** A purchase the catalog has dropped is worth naming where the rep expected to see it:
 * the diameter and type they just asked for. docs/DESIGN.md 7.3. */
function discontinuedNotes(profile: CustomerProfile | undefined, spec: ParsedSpec): Note[] {
  if (profile === undefined) return [];

  const types = spec.type?.map((entry) => entry.value);

  return [...profile.discontinued].sort().flatMap((sku) => {
    const purchase = profile.purchases[sku];
    if (purchase === undefined) return [];
    if (spec.diameter !== undefined && purchase.spec.diameter?.nominal !== spec.diameter.nominal) {
      return [];
    }
    if (
      types !== undefined &&
      purchase.spec.type?.some((entry) => types.includes(entry.value)) !== true
    ) {
      return [];
    }

    return [discontinuedNote(sku)];
  });
}

function ranked(
  status: Answer['status'],
  spec: ParsedSpec,
  compatible: readonly CatalogItem[],
  config: MatcherConfig,
  limit: number,
  profile: CustomerProfile | undefined,
): Answer {
  const s = compatible.map((item) => compatibility(spec, item, config));
  // An absent profile leaves lambda at 0, which is the uniform prior exactly, so the
  // no-customer response needs no branch of its own. docs/DESIGN.md 7.2.
  const distribution = historyPrior(profile, spec, compatible, config);
  const prior = compatible.map((item) => distribution.q.get(item.sku) ?? 0);
  const { p } = posterior(compatible, s, prior, spec.residue.length, config);
  const personal =
    profile === undefined ? undefined : personalize(profile, spec, compatible, distribution);

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
    .map(({ item, confidence, components }) => {
      const explanation = explainMatch(spec, item, meta);
      const personalization = personal?.get(item.sku);

      return labelled(
        {
          sku: item.sku,
          catalogId: item.catalogId,
          description: item.description,
          active: item.active,
          confidence,
          explanation:
            personalization === undefined
              ? explanation
              : withPersonalization(explanation, personalization),
          components,
        },
        config,
      );
    });

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

/** The lines a reference names, most recent first. There is no compatible set behind
 * them: recency decides the order, and the quantity and date are the explanation.
 * docs/DESIGN.md 7.4. */
function referencedOrders(
  spec: ParsedSpec,
  lines: readonly ReferencedLine[],
  deps: MatchQueryDeps,
  config: MatcherConfig,
  limit: number,
): Answer {
  const meta: ExplanationMeta = { compatibleCount: 0, disambiguateBy: [] };

  const results = lines
    .flatMap((line, rank) => {
      // A SKU the catalog dropped is still what the customer ordered, so it is shown as
      // inactive rather than hidden; one the catalog never had cannot be shown at all.
      const item = deps.catalog.bySku(line.sku);
      if (item === undefined) return [];

      return [
        labelled(
          {
            sku: item.sku,
            catalogId: item.catalogId,
            description: item.description,
            active: item.active,
            confidence: line.confidence,
            explanation: withPersonalization(explainMatch(spec, item, meta), {
              reason: orderedReason(line.quantity, line.orderDate),
              prior: 1,
            }),
            // Rank is the whole of the evidence, and nothing weighted these against each
            // other the way a prior over C would.
            components: { compatibility: config.historyDecayPerRank ** rank, prior: 1 },
          },
          config,
        ),
      ];
    })
    .slice(0, limit);

  return {
    status: 'history',
    compatibleCount: 0,
    results,
    alternatives: [],
    notes: notesFor(spec, undefined),
  };
}

function changeOf(spec: ParsedSpec, attribute: AttributeName): AttributeChange | [] {
  const value =
    attribute === 'material'
      ? spec.material && formatMaterial(spec.material.value)
      : attribute === 'finish'
        ? spec.finish && formatFinish(spec.finish.value)
        : attribute === 'standard'
          ? spec.standard
          : attribute === 'length'
            ? spec.length && formatLength(spec.length)
            : undefined;

  return value === undefined ? [] : { attr: attribute, value };
}

/** Everything the query states about attributes, once the intent has had its say. */
function attributeAnswer(
  query: string,
  spec: ParsedSpec,
  deps: MatchQueryDeps,
  config: MatcherConfig,
  limit: number,
  profile: CustomerProfile | undefined,
  carried: readonly Note[],
): Answer {
  const items = deps.catalog.active();
  const compatible = compatibleSet(spec, items);
  const status = deriveStatus(spec, compatible);

  const answer =
    status === 'unparsed'
      ? unparsed(query, spec, deps, config, limit)
      : status === 'none'
        ? none(spec, items, config, limit)
        : ranked(status, spec, compatible, config, limit, profile);

  const added = [...carried, ...discontinuedNotes(profile, spec)];

  return added.length === 0 ? answer : { ...answer, notes: [...answer.notes, ...added] };
}

function answerFor(
  request: MatchRequest,
  parse: QueryParse,
  deps: MatchQueryDeps,
  config: MatcherConfig,
): Answer {
  const { spec, intentCandidates } = parse;
  const limit = request.limit ?? DEFAULT_LIMIT;
  const profile = request.customerId === undefined ? undefined : deps.profile?.(request.customerId);

  const { phrase } = detectIntent(intentCandidates);
  if (phrase === undefined) {
    return attributeAnswer(request.query, spec, deps, config, limit, profile, []);
  }

  const lines =
    request.customerId === undefined ? undefined : deps.history?.byCustomer(request.customerId);

  // A customer with no line at all is no more able to resolve a reference than no
  // customer is, so both reach the prompt. docs/DESIGN.md 7.5.
  const reference = resolveReference(
    lines === undefined || lines.length === 0 ? undefined : lines,
    spec,
    config,
  );

  if (reference.form === 'override') {
    const changes = reference.changed.flatMap((attribute) => changeOf(reference.spec, attribute));

    return attributeAnswer(request.query, reference.spec, deps, config, limit, profile, [
      historyReferenceNote(reference.base.orderDate, changes),
    ]);
  }

  if (reference.form === 'pure') {
    return referencedOrders(spec, reference.lines, deps, config, limit);
  }

  // No customer: the reference cannot be resolved, but a query that also asks for a
  // change still has attributes the pipeline can answer. docs/DESIGN.md 7.4.
  const prompt = customerRequiredNote(phrase);
  if (statesOverride(spec)) {
    return attributeAnswer(request.query, spec, deps, config, limit, profile, [prompt]);
  }

  return {
    status: 'history',
    compatibleCount: 0,
    results: [],
    alternatives: [],
    notes: [prompt],
  };
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
