/**
 * @module core/rule
 *
 * Rule evaluation and seat recommendation:
 *   - `proximitySectionIds`   – adjacent section IDs within a radius
 *   - `byScope`               – filter listings by ComparableScope variant
 *   - `buildComparableFilter` – full filter pipeline for one rule
 *   - `evaluateRule`          – run one PricingRule against a listing pool
 *   - `recommendForSeat`      – evaluate all rules for a single seat
 */

import * as R from 'ramda';
import { Option, Result } from '@carbonteq/fp';
import type { NonEmptyArray } from 'ramda';
import type { ID, Radius, CurrencyCode, MaxAgeDays } from '../domain/primitives.js';
import type {
  Listing,
  ComparableScope,
  PricingRule,
  RuleOutcome,
  SeatRecommendation,
} from '../domain/types.js';
import { PricingErrors } from '../domain/errors.js';
import { byCurrency, byValidPrice, byMaxAge } from './listing.js';
import { computePrice } from './pricing.js';

// ---------------------------------------------------------------------------
// Proximity helper
// ---------------------------------------------------------------------------

/**
 * Given a sorted list of all distinct section IDs, return those whose index
 * is within `radius` steps of `ofSectionId`.
 *
 * Returns an empty array if `ofSectionId` is not found.
 */
export const proximitySectionIds = (
  allSectionIds: readonly ID[],
  ofSectionId: ID,
  radius: Radius,
): ID[] => {
  const sorted = R.sort(R.comparator(R.lt), allSectionIds as ID[]);
  const idx = sorted.indexOf(ofSectionId);
  if (idx === -1) return [];
  return sorted.slice(Math.max(0, idx - radius), idx + radius + 1);
};

// ---------------------------------------------------------------------------
// Scope filter
// ---------------------------------------------------------------------------

type ScopeHandler<S extends ComparableScope> = (
  scope: S,
  allSectionIds: readonly ID[],
  listings: Listing[],
) => Listing[];

const scopeHandlers: {
  [K in ComparableScope['type']]: ScopeHandler<Extract<ComparableScope, { type: K }>>;
} = {
  zone: (scope, _allSectionIds, listings) =>
    R.filter((l) => R.includes(l.zoneId, scope.zoneIds), listings),

  section: (scope, _allSectionIds, listings) =>
    R.filter((l) => R.includes(l.sectionId, scope.sectionIds), listings),

  proximity: (scope, allSectionIds, listings) => {
    const nearbyIds = proximitySectionIds(allSectionIds, scope.ofSectionId, scope.radius);
    return R.filter((l) => R.includes(l.sectionId, nearbyIds), listings);
  },
};

/** Filter listings down to those matching the given `ComparableScope`. */
export const byScope =
  (scope: ComparableScope, allSectionIds: readonly ID[]) =>
  (listings: readonly Listing[]): Listing[] =>
    (scopeHandlers[scope.type] as ScopeHandler<ComparableScope>)(
      scope,
      allSectionIds,
      listings as Listing[],
    );

// ---------------------------------------------------------------------------
// Composite filter pipeline
// ---------------------------------------------------------------------------

/**
 * Build the full comparable-selection pipeline for a single rule.
 *
 * Order: currency → valid price → age cap → scope
 */
export const buildComparableFilter = (opts: {
  currency: CurrencyCode;
  scope: ComparableScope;
  maxAgeDays: Option<MaxAgeDays>;
  allSectionIds: readonly ID[];
  nowMs: number;
}) =>
  R.pipe(
    byCurrency(opts.currency),
    byValidPrice,
    byMaxAge(opts.maxAgeDays, opts.nowMs),
    byScope(opts.scope, opts.allSectionIds),
  );

// ---------------------------------------------------------------------------
// Single-rule evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate one `PricingRule` against the full listing pool.
 *
 * @returns `RuleOutcome` — `Ok` with a price, or `Err` with the reason.
 */
export const evaluateRule = (
  rule: PricingRule,
  listings: readonly Listing[],
  currency: CurrencyCode,
  allSectionIds: readonly ID[],
  nowMs: number,
): RuleOutcome => {
  const comparables = buildComparableFilter({
    currency,
    scope: rule.target,
    maxAgeDays: rule.maxAgeDays,
    allSectionIds,
    nowMs,
  })(listings);

  if (comparables.length === 0) {
    return {
      ruleId: rule.id,
      ruleLabel: rule.label,
      result: Result.Err(PricingErrors.noComparables()),
    };
  }

  return {
    ruleId: rule.id,
    ruleLabel: rule.label,
    result: computePrice({
      comparables: comparables as NonEmptyArray<Listing>,
      increment: rule.increment,
      floor: rule.floor,
      ceiling: rule.ceiling,
      minSample: rule.minSample,
    }),
  };
};

// ---------------------------------------------------------------------------
// Per-seat recommendation
// ---------------------------------------------------------------------------

/**
 * Evaluate every rule in order and build a full `SeatRecommendation` for one
 * listing.
 *
 * The `recommendedPrice` is the result of the **first** rule that succeeds.
 * `Option.None` when every rule fails.
 */
export const recommendForSeat = (
  listing: Listing,
  rules: readonly PricingRule[],
  listings: readonly Listing[],
  currency: CurrencyCode,
  allSectionIds: readonly ID[],
  nowMs: number,
): SeatRecommendation => {
  const outcomes: RuleOutcome[] = R.map(
    (rule) => evaluateRule(rule, listings, currency, allSectionIds, nowMs),
    rules as PricingRule[],
  );

  const firstSuccess = R.find((o: RuleOutcome) => o.result.isOk(), outcomes);
  const recommendedPrice = firstSuccess ? firstSuccess.result.toOption() : Option.None;

  return {
    seatId: listing.seatId,
    eventId: listing.eventId,
    zoneId: listing.zoneId,
    sectionId: listing.sectionId,
    recommendedPrice,
    outcomes,
  };
};
