import type { Alternative, Match, MatchRequest, MatchResponse, Note } from '../domain/match';
import type { AttributeName, Length, ParsedSpec } from '../domain/spec';
import type { CatalogItem, CustomerProfile } from '../domain/catalog';
import type { AlternativeCandidate } from '../matching/compatibility';
import {
  alternatives,
  compatibleSet,
  deriveStatus,
  disambiguateBy,
  failedConstraint,
  nearMisses,
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
  unboundLengthNote,
  unitMismatchNote,
  unknownDiameterNote,
  unknownTypeNote,
  unrankedPoolNote,
  unresolvedReferenceNote,
  unverifiedResidueNote,
  withPersonalization,
} from '../matching/explainer';
import { bindLength } from '../matching/lengthBearing';
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
  readonly history?: OrderHistoryRepository;
  readonly profile?: (customerId: string) => CustomerProfile | undefined;
}

type Answer = Omit<MatchResponse, 'query' | 'parsed' | 'timingsMs'>;

const DEFAULT_LIMIT = 3;

const bySku = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function labelled(match: Match, config: MatcherConfig): Match {
  if (config.labels.provisional) return match;

  return { ...match, label: labelFor(match.confidence, config).label };
}

const QUALIFIERS = ['length', 'standard', 'material', 'finish'] as const;

type Qualifier = (typeof QUALIFIERS)[number];

const PREPOSITION: Readonly<Record<Qualifier, string>> = {
  length: 'at',
  standard: 'to',
  material: 'in',
  finish: 'in',
};

const isQualifier = (attribute: AttributeName): attribute is Qualifier =>
  (QUALIFIERS as readonly AttributeName[]).includes(attribute);

function statedValue(spec: ParsedSpec, attribute: Qualifier): string | undefined {
  switch (attribute) {
    case 'length':
      return spec.length && formatLength(spec.length);
    case 'standard':
      return spec.standard;
    case 'material':
      return spec.material && formatMaterial(spec.material.value);
    case 'finish':
      return spec.finish && formatFinish(spec.finish.value);
  }
}

function qualifierOnlyNote(spec: ParsedSpec, failed: Qualifier): Note | undefined {
  const value = statedValue(spec, failed);
  if (value === undefined) return undefined;

  const held = QUALIFIERS.slice(0, QUALIFIERS.indexOf(failed))
    .map((attribute) => statedValue(spec, attribute))
    .filter((stated) => stated !== undefined);

  return {
    code: 'failedConstraint',
    message: `no ${[...held, 'item'].join(' ')} ${PREPOSITION[failed]} ${value}`,
  };
}

const statedQualifiers = (spec: ParsedSpec): string =>
  QUALIFIERS.map((attribute) => statedValue(spec, attribute))
    .filter((value) => value !== undefined)
    .join(' ');

const namesNoProduct = (spec: ParsedSpec): boolean =>
  spec.diameter === undefined && (spec.type === undefined || spec.type.length === 0);

function diagnosis(spec: ParsedSpec, failed: AttributeName): Note {
  if (failed === 'diameter' && spec.diameter?.known === false) {
    return unknownDiameterNote(spec.diameter.nominal);
  }

  if (failed === 'type' && spec.provenance.type === 'unrecognized') {
    return unknownTypeNote(spec.evidence.type ?? '');
  }

  if (isQualifier(failed) && namesNoProduct(spec)) {
    return qualifierOnlyNote(spec, failed) ?? failedConstraintNote(spec, failed);
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

function discontinuedNotes(profile: CustomerProfile | undefined, spec: ParsedSpec): Note[] {
  if (profile === undefined) return [];

  const types = spec.type?.map((entry) => entry.value);

  return [...profile.discontinued].sort(bySku).flatMap((sku) => {
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

function offered(
  spec: ParsedSpec,
  candidates: readonly AlternativeCandidate[],
  limit: number,
): Alternative[] {
  return candidates.slice(0, limit).map(({ item, closeness, relaxed }) => ({
    sku: item.sku,
    catalogId: item.catalogId,
    description: item.description,
    active: item.active,
    closeness,
    relaxed: [...relaxed],
    explanation: explainAlternative(spec, item, relaxed, closeness),
  }));
}

function ranked(
  status: Answer['status'],
  spec: ParsedSpec,
  items: readonly CatalogItem[],
  compatible: readonly CatalogItem[],
  config: MatcherConfig,
  limit: number,
  profile: CustomerProfile | undefined,
): Answer {
  const s = compatible.map((item) => compatibility(spec, item, config));
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

  const room = limit - results.length;
  const near =
    room <= 0 ? [] : nearMisses(spec, items, config, new Set(compatible.map((item) => item.sku)));

  return {
    status,
    compatibleCount: compatible.length,
    results,
    alternatives: offered(spec, near, room),
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

  return {
    status: 'none',
    compatibleCount: 0,
    results: [],
    alternatives: offered(spec, alternatives(spec, items, config), limit),
    notes: notesFor(spec, failed === undefined ? undefined : diagnosis(spec, failed)),
  };
}

function unparsed(
  query: string,
  spec: ParsedSpec,
  pool: readonly CatalogItem[],
  deps: MatchQueryDeps,
  config: MatcherConfig,
  limit: number,
): Answer {
  const tokens = normalize(query).tokens.map((token) => correct(token.text)?.word ?? token.text);
  const meta: ExplanationMeta = { compatibleCount: pool.length, disambiguateBy: [] };
  const admitted = new Set(pool.map((item) => item.sku));

  const candidates = score(deps.index, tokens).filter((entry) => admitted.has(entry.sku));

  if (candidates.length === 0) {
    return {
      status: 'unparsed',
      compatibleCount: pool.length,
      results: [],
      alternatives: [],
      notes: notesFor(spec, unrankedPoolNote(pool.length, statedQualifiers(spec))),
    };
  }

  const best = candidates[0]?.score ?? 1;

  const results = candidates.slice(0, limit).flatMap((entry) => {
    const item = deps.catalog.bySku(entry.sku);
    if (item === undefined) return [];

    const overlap = entry.score / best;

    return [
      labelled(
        {
          sku: item.sku,
          catalogId: item.catalogId,
          description: item.description,
          active: item.active,
          confidence: config.lexicalCap * overlap,
          explanation: explainMatch(spec, item, meta),
          components: { compatibility: overlap, prior: 1 },
        },
        config,
      ),
    ];
  });

  return {
    status: 'unparsed',
    compatibleCount: pool.length,
    results,
    alternatives: [],
    notes: notesFor(spec, undefined),
  };
}

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
  if (!isQualifier(attribute)) return [];

  const value = statedValue(spec, attribute);

  return value === undefined ? [] : { attr: attribute, value };
}

function unboundNotes(spec: ParsedSpec, unbound: Length | undefined): Note[] {
  const type = spec.type?.[0]?.value;
  if (unbound === undefined || type === undefined) return [];

  return [unboundLengthNote(type, unbound)];
}

function attributeAnswer(
  query: string,
  parsed: ParsedSpec,
  deps: MatchQueryDeps,
  config: MatcherConfig,
  limit: number,
  profile: CustomerProfile | undefined,
  carriedFor: (unbound: Length | undefined) => readonly Note[],
): Answer {
  const items = deps.catalog.active();
  const { spec, unbound } = bindLength(parsed, items);
  const compatible = compatibleSet(spec, items);
  const status = deriveStatus(spec, compatible);

  let answer: Answer;
  if (compatible.length === 0) {
    answer = none(spec, items, config, limit);
  } else if (status === 'unparsed') {
    answer = unparsed(query, spec, compatible, deps, config, limit);
  } else {
    answer = ranked(status, spec, items, compatible, config, limit, profile);
  }

  const added = [
    ...unboundNotes(spec, unbound),
    ...carriedFor(unbound),
    ...discontinuedNotes(profile, spec),
  ];

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
    return attributeAnswer(request.query, spec, deps, config, limit, profile, () => []);
  }

  const lines =
    request.customerId === undefined ? undefined : deps.history?.byCustomer(request.customerId);

  const reference = resolveReference(
    lines === undefined || lines.length === 0 ? undefined : lines,
    spec,
    config,
  );

  if (reference.form === 'override') {
    return attributeAnswer(
      request.query,
      reference.spec,
      deps,
      config,
      limit,
      profile,
      (unbound) => [
        historyReferenceNote(
          reference.base.orderDate,
          reference.changed
            .filter((attribute) => attribute !== 'length' || unbound === undefined)
            .flatMap((attribute) => changeOf(reference.spec, attribute)),
        ),
      ],
    );
  }

  if (reference.form === 'unresolved') {
    return attributeAnswer(request.query, spec, deps, config, limit, profile, () => [
      unresolvedReferenceNote(phrase),
    ]);
  }

  if (reference.form === 'pure') {
    return referencedOrders(spec, reference.lines, deps, config, limit);
  }

  const prompt = customerRequiredNote(phrase);
  if (statesOverride(spec)) {
    return attributeAnswer(request.query, spec, deps, config, limit, profile, () => [prompt]);
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
