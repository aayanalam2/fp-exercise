/**
 * @module engine
 *
 * Top-level pricing engine.
 *
 * `runPricingEngine` is the single entry point: it accepts a `MarketSnapshot`
 * + `Criteria` and returns a `PricingReport` with a recommendation per seat.
 */

import * as R from 'ramda';
import { Result } from '@carbonteq/fp';
import type {
  Listing,
  MarketSnapshot,
  Criteria,
  PricingReport,
  SeatRecommendation,
  Unit,
} from './domain/types.js';
import type { EngineError } from './domain/errors.js';
import type { ID } from './domain/primitives.js';
import { PricingErrors } from './domain/errors.js';
import { ISODateString } from './domain/primitives.js';
import { recommendForSeat } from './core/rule.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sorted, deduplicated list of every `sectionId` in the snapshot. */
const collectSectionIds = (listings: readonly Listing[]): ID[] =>
  R.pipe(
    (ls: Listing[]) => R.map((l: Listing) => l.sectionId, ls),
    R.uniq,
    R.sort(R.comparator(R.lt)),
    (ids) => ids as ID[],
  )(listings as Listing[]);

/** Ensure criteria currency matches the event currency. */
const validateCurrency = (
  snapshot: MarketSnapshot,
  criteria: Criteria,
): Result<Unit, EngineError> => {
  if (snapshot.event.currency !== criteria.currency) {
    return Result.Err(PricingErrors.currencyMismatch(snapshot.event.currency, criteria.currency));
  }
  return Result.Ok(void 0);
};

// ---------------------------------------------------------------------------
// runPricingEngine
// ---------------------------------------------------------------------------

/**
 * Run the pricing engine over an entire market snapshot.
 *
 * @param snapshot  Current state of the market (event + all listings).
 * @param criteria  Rules to apply, in evaluation order.
 * @param nowMs     Current UTC time in ms (defaults to `Date.now()`).
 *                  Override in tests for deterministic staleness filtering.
 * @returns `Result.Ok(PricingReport)` or `Result.Err(EngineError)`.
 */
export const runPricingEngine = (
  snapshot: MarketSnapshot,
  criteria: Criteria,
  nowMs: number = Date.now(),
): Result<PricingReport, EngineError> =>
  validateCurrency(snapshot, criteria).map(() => {
    const allSectionIds = collectSectionIds(snapshot.listings);

    const seats: SeatRecommendation[] = R.map(
      (listing) =>
        recommendForSeat(
          listing,
          criteria.rules,
          snapshot.listings,
          criteria.currency,
          allSectionIds,
          nowMs,
        ),
      snapshot.listings,
    );

    return {
      criteriaId: criteria.criteriaId,
      eventId: snapshot.event.eventId,
      evaluatedAt: ISODateString.create(new Date(nowMs).toISOString()).unwrap(),
      seats,
    };
  });
