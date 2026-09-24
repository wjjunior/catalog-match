import type { Finish, Material } from '../domain/attributes';
import { finishFamilyOf, FINISHES, MATERIALS, materialFamilyOf } from '../domain/attributes';
import type { CatalogItem, CustomerProfile } from '../domain/catalog';
import type { PersonalizationExplanation } from '../domain/match';
import type { AttributeName, ParsedSpec } from '../domain/spec';
import {
  formatFinish,
  formatMaterial,
  overrideReason,
  preferenceReason,
  repeatReason,
  siblingReason,
  unmatchedReason,
} from '../matching/explainer';
import type { HistoryPriorResult, PriorReason } from './historyPrior';

/** The attributes a profile keeps shares of and a query can contradict. The thread system
 * is not one: the diameter fixes it, so every item of C already agrees with it. */
const SHARED = ['material', 'finish'] as const;

type Shared = (typeof SHARED)[number];

interface Preference {
  attribute: Shared;
  /** The catalog spelling, so a compatible item can be tested against it. */
  value: string;
  formatted: string;
  /** False when nothing in C carries the value, which is what leaves it unmatchable. */
  present: boolean;
  overridden: boolean;
}

const isMaterial = (value: string): value is Material =>
  (MATERIALS as readonly string[]).includes(value);

const isFinish = (value: string): value is Finish =>
  (FINISHES as readonly string[]).includes(value);

function format(attribute: Shared, value: string): string | undefined {
  if (attribute === 'material') return isMaterial(value) ? formatMaterial(value) : undefined;

  return isFinish(value) ? formatFinish(value) : undefined;
}

/** A value outside its attribute's table (already a family) stands for itself, so a family
 * term compares equal to the member it names. */
function familyOf(attribute: Shared, value: string): string {
  if (attribute === 'material') return isMaterial(value) ? materialFamilyOf(value) : value;

  return isFinish(value) ? finishFamilyOf(value) : value;
}

const isMember = (attribute: Shared, value: string): boolean =>
  attribute === 'material' ? isMaterial(value) : isFinish(value);

const valueOf = (spec: ParsedSpec, attribute: Shared): string | undefined =>
  attribute === 'material' ? spec.material?.value : spec.finish?.value;

/** Ties are settled by code unit rather than by `localeCompare`: the value a customer is
 * told their history prefers may not depend on the locale the server happens to run in. */
function top(shares: Record<string, number>): string | undefined {
  let best: string | undefined;
  let mass = 0;

  for (const [value, share] of Object.entries(shares)) {
    if (best === undefined || share > mass || (share === mass && value < best)) {
      best = value;
      mass = share;
    }
  }

  return best;
}

function preferenceOf(
  attribute: Shared,
  profile: CustomerProfile,
  spec: ParsedSpec,
  candidates: readonly CatalogItem[],
): Preference | undefined {
  // A history that weighed nothing leaves every share at the alpha prior, and a tie-break
  // over that flat table would name a value the customer never expressed.
  if (profile.nEff === 0) return undefined;

  const value = top(profile.shares[attribute]);
  if (value === undefined) return undefined;

  const formatted = format(attribute, value);
  if (formatted === undefined) return undefined;

  const stated = valueOf(spec, attribute);

  return {
    attribute,
    value,
    formatted,
    present: candidates.some((item) => valueOf(item.spec, attribute) === value),
    // A member the query names satisfies the family it belongs to, but a different exact
    // member never satisfies another exact member, even inside the same family.
    overridden:
      stated !== undefined &&
      stated !== value &&
      (isMember(attribute, stated) || familyOf(attribute, stated) !== familyOf(attribute, value)),
  };
}

/** The query first, then what the customer bought, then what they merely tend to buy: the
 * most specific true thing about this item, not every true thing. docs/DESIGN.md 7.3. */
function reasonFor(
  reason: PriorReason,
  preferred: readonly string[],
  overridden: boolean,
  unmatched: Preference | undefined,
): string | undefined {
  if (overridden) return overrideReason(preferred);
  if (reason.purchase !== undefined) {
    return repeatReason(reason.purchase.count, reason.purchase.lastOrderDate);
  }
  if (reason.discontinuedSibling !== undefined) return siblingReason(reason.discontinuedSibling);
  if (unmatched !== undefined) return unmatchedReason(unmatched.attribute, unmatched.formatted);

  return preferred.length === 0 ? undefined : preferenceReason(preferred);
}

/** Keyed by SKU, and an item the history has nothing to say about is absent rather than
 * carrying an invented preference. docs/DESIGN.md 7.3 and 7.5. */
export function personalize(
  profile: CustomerProfile,
  spec: ParsedSpec,
  candidates: readonly CatalogItem[],
  prior: HistoryPriorResult,
): ReadonlyMap<string, PersonalizationExplanation> {
  const preferences = SHARED.flatMap(
    (attribute) => preferenceOf(attribute, profile, spec, candidates) ?? [],
  );

  const preferred = preferences.map((preference) => preference.formatted);
  const overriddenBy: AttributeName[] = preferences
    .filter((preference) => preference.overridden)
    .map((preference) => preference.attribute);
  // A value the query overrode was never going to be matched, so it is not also reported
  // as one the catalog could not honour.
  const unmatched = preferences.find((preference) => !preference.overridden && !preference.present);

  const explanations = new Map<string, PersonalizationExplanation>();

  for (const item of candidates) {
    const reason = prior.reasons.get(item.sku);
    const q = prior.q.get(item.sku);
    if (reason === undefined || q === undefined) continue;

    const text = reasonFor(reason, preferred, overriddenBy.length > 0, unmatched);
    if (text === undefined) continue;

    explanations.set(
      item.sku,
      overriddenBy.length === 0
        ? { reason: text, prior: q }
        : { reason: text, prior: q, overriddenBy },
    );
  }

  return explanations;
}
