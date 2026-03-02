/**
 * @module engine
 *
 * Top-level pricing engine.
 *
 * `runPricingEngine` is the single public entry point: it accepts a
 * `MarketSnapshot` + `Criteria` and returns a `PricingReport` containing a
 * recommendation for every seat in the snapshot.
 */

import * as R from 'ramda';
import { Result } from '@carbonteq/fp';
import { PricingErrors } from './errors.js';
import type { EngineError } from './errors.js';
import type {
  MarketSnapshot,
  Criteria,
  PricingReport,
  SeatRecommendation,
  Unit,
  Listing,
} from './types.js';
import { recommendForSeat } from './rule.js';

// ---------------------------------------------------------------------------
// Helper: collect distinct section IDs from a snapshot
// ---------------------------------------------------------------------------

/**
 * Returns a sorted, deduplicated list of every `sectionId` present in the
 * snapshot's listing pool.  Used by the `proximity` scope resolver.
 */

const collectSectionIds = R.pipe(
  R.map((l: Listing) => l.sectionId),
  R.uniq,
  R.sort(R.comparator(R.lt)),
  R.map(String),
);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Ensures the criteria currency matches the event currency of the snapshot.
 *
 * Returns `Result.Ok(void 0)` on success, or
 * `Result.Err(message)` when the currencies diverge.
 *
 * Currency comparison is case-insensitive.
 */
const validateCurrency = (
  snapshot: MarketSnapshot,
  criteria: Criteria,
): Result<Unit, EngineError> => {
  const eventCcy = snapshot.event.currency;
  const criteriaCcy = criteria.currency;
  if (eventCcy !== criteriaCcy) {
    return Result.Err(PricingErrors.currencyMismatch(eventCcy, criteriaCcy));
  }
  return Result.Ok(void 0);
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run the pricing engine over an entire market snapshot.
 *
 * @param snapshot   Current state of the market (event + all listings).
 * @param criteria   Rules to apply, in evaluation order.
 * @param nowMs      Optional: current UTC time as ms-since-epoch.
 *                   Defaults to `Date.now()`.  Override in tests for
 *                   deterministic staleness filtering.
 * @returns          `Result.Ok(PricingReport)` with one `SeatRecommendation`
 *                   per seat, or `Result.Err(message)` on a currency mismatch.
 */
export const runPricingEngine = (
  snapshot: MarketSnapshot,
  criteria: Criteria,
  nowMs: number = Date.now(),
): Result<PricingReport, EngineError> =>
  validateCurrency(snapshot, criteria).map(() => {
    const allSectionIds = collectSectionIds(snapshot.listings);
    const { rules } = criteria;

    const seats: SeatRecommendation[] = R.map(
      (listing) =>
        recommendForSeat(
          listing,
          rules,
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
      evaluatedAt: new Date(nowMs).toISOString(),
      seats,
    };
  });
