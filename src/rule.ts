/**
 * @module rule
 *
 * Pure functions for evaluating a single PricingRule against a pool of
 * listings, and for evaluating the full ordered rule list for one seat.
 *
 * "First rule that produces a price wins" – rules are evaluated in array
 * order; the first successful result becomes the seat's recommended price.
 */

import * as R from 'ramda';
import { Option, Result } from '@carbonteq/fp';
import type { NonEmptyArray } from 'ramda';
import type {
  Listing,
  PricingRule,
  RuleOutcome,
  SeatRecommendation,
  ID,
  CurrencyCode,
} from './types.js';
import { buildComparableFilter } from './filters.js';
import { computePrice } from './base.js';
import { PricingErrors } from './errors.js';

// ---------------------------------------------------------------------------
// Single-rule evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate one `PricingRule` against the full listing pool.
 *
 * @param rule        The rule to evaluate.
 * @param listings    All listings in the snapshot (pre-currency-filtered or not).
 * @param currency    The criteria currency used for matching.
 * @param allSectionIds Sorted list of every section ID in the snapshot.
 * @param nowMs       Current UTC timestamp in milliseconds.
 * @returns           `RuleOutcome` containing result (or undefined + reason).
 */
export const evaluateRule = (
  rule: PricingRule,
  listings: readonly Listing[],
  currency: CurrencyCode,
  allSectionIds: readonly ID[],
  nowMs: number
): RuleOutcome => {
  const filterComparables = buildComparableFilter({
    currency,
    scope: rule.target,
    maxAgeDays: rule.maxAgeDays,
    allSectionIds,
    nowMs,
  });

  const comparables = filterComparables(listings);

  if (comparables.length === 0) {
    return {
      ruleId: rule.id,
      ruleLabel: rule.label,
      result: Result.Err(PricingErrors.noComparables()),
    };
  }

  const result = computePrice({
    comparables: comparables as NonEmptyArray<Listing>,
    increment: rule.increment,
    floor: rule.floor,
    ceiling: rule.ceiling,
    minSample: rule.minSample,
  });

  return {
    ruleId: rule.id,
    ruleLabel: rule.label,
    result,
  };
};

// ---------------------------------------------------------------------------
// Per-seat recommendation
// ---------------------------------------------------------------------------

/**
 * Evaluate every rule in `rules` (in order) and build a full
 * `SeatRecommendation` for the given listing.
 *
 * The `recommendedPrice` is taken from the **first** rule outcome that has a
 * defined `result`.  If no rule produces a price, `recommendedPrice` is
 * `undefined`.
 */
export const recommendForSeat = (
  listing: Listing,
  rules: readonly PricingRule[],
  listings: readonly Listing[],
  currency: CurrencyCode,
  allSectionIds: readonly ID[],
  nowMs: number
): SeatRecommendation => {
  const outcomes: RuleOutcome[] = R.map(
    (rule) => evaluateRule(rule, listings, currency, allSectionIds, nowMs),
    rules as PricingRule[]
  );

  // Walk outcomes in order; take the first Ok result as the recommendation.
  const firstSuccess = R.find(
    (o: RuleOutcome) => o.result.isOk(),
    outcomes
  );

  const recommendedPrice = firstSuccess
    ? firstSuccess.result.toOption()
    : Option.None;

  return {
    seatId: listing.seatId,
    eventId: listing.eventId,
    zoneId: listing.zoneId,
    sectionId: listing.sectionId,
    recommendedPrice,
    outcomes,
  };
};
