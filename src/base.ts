/**
 * @module base
 *
 * Pure functions for computing a single representative ("base") price from a
 * pool of comparable listings, then adjusting it with increment and bounds.
 *
 * The base price is the **median** of the comparable `listingPrice` values.
 * Median is preferred over mean because it is robust to outlier asks.
 */

import * as R from 'ramda';
import { Result, Option } from '@carbonteq/fp';
import type { Listing, NumericBound, PriceResult } from './types.js';
import { PricingErrors } from './errors.js';
import type { ComputeError } from './errors.js';
import { NonEmptyArray } from 'ramda';

// ---------------------------------------------------------------------------
// Extract prices
// ---------------------------------------------------------------------------

/**
 * Pluck the numeric `listingPrice` from each listing.
 * Returns a plain number array (not a Ramda lens – avoids type noise).
 */
export const extractPrices = (listings: NonEmptyArray<Listing>): number[] =>
  R.map((l) => l.listing.listingPrice, listings);

// ---------------------------------------------------------------------------
// Median
// ---------------------------------------------------------------------------

/**
 * Compute the median of a non-empty, finite number array.
 *
 * - Array is sorted in ascending order (original is not mutated via R.sort).
 * - For even-length arrays the average of the two middle values is returned.
 *
 * Returns `None` when the array is empty.
 */
export const median = (values: readonly number[]): Option<number> => {
  if (values.length === 0) return Option.None;
  const sorted = R.sort(R.comparator(R.lt), values as number[]);
  const mid = Math.floor(sorted.length / 2);
  const result = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Option.Some(result);
};

// ---------------------------------------------------------------------------
// Increment
// ---------------------------------------------------------------------------

/**
 * Add a signed increment to a base price.
 *
 * The result may be negative if a large negative increment is applied; callers
 * that care should apply a floor afterwards.
 */
export const applyIncrement: (increment: number) => (base: number) => number = R.curry(
  (increment: number, base: number): number => base + increment,
);

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

/**
 * Clamp a price to optional floor and ceiling bounds.
 *
 * - If only `floor` is defined: `max(price, floor)`
 * - If only `ceiling` is defined: `min(price, ceiling)`
 * - If both: clamp to [floor, ceiling].
 *   When floor > ceiling the ceiling takes precedence (price = ceiling) to
 *   avoid returning a nonsensical value; this is a defensive choice.
 */
export const applyBounds: (
  floor: NumericBound,
  ceiling: NumericBound,
) => (price: number) => number = R.curry(
  (floor: NumericBound, ceiling: NumericBound, price: number): number => {
    const floored = floor !== undefined ? Math.max(price, floor) : price;
    const capped = ceiling !== undefined ? Math.min(floored, ceiling) : floored;
    return capped;
  },
);

// ---------------------------------------------------------------------------
// Compose: base → adjusted PriceResult
// ---------------------------------------------------------------------------

/**
 * Given a pool of comparable listings (already filtered), apply the full
 * pricing computation:
 *
 *   median(prices) → + increment → clamp(floor, ceiling)
 *
 * Returns:
 *   - `Result.Ok({ price })` on success.
 *   - `Result.Err(reason)` when the pool is empty or minSample is not met.
 */
export const computePrice = (opts: {
  comparables: NonEmptyArray<Listing>;
  increment: number;
  floor: NumericBound;
  ceiling: NumericBound;
  minSample: number | undefined;
}): Result<PriceResult, ComputeError> => {
  const { comparables, increment, floor, ceiling, minSample } = opts;

  if (minSample !== undefined && comparables.length < minSample) {
    return Result.Err(PricingErrors.insufficientSample(comparables.length, minSample));
  }

  const prices = extractPrices(comparables);
  const baseResult = median(prices).toResult(PricingErrors.noComparables());

  return baseResult.map((base) => {
    const adjusted = R.pipe(applyIncrement(increment), applyBounds(floor, ceiling))(base);
    return { price: adjusted };
  });
};
