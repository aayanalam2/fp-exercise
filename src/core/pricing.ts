/**
 * @module core/pricing
 *
 * Pure pricing computation functions:
 *   - `median`         – statistical median of a number array
 *   - `applyIncrement` – add a signed delta to a base price
 *   - `applyBounds`    – clamp a price to optional floor/ceiling
 *   - `computePrice`   – full pipeline: median → increment → bounds
 */

import * as R from 'ramda';
import { Result, Option } from '@carbonteq/fp';
import type { NonEmptyArray } from 'ramda';
import type { Floor, Ceiling, MinSample } from '../domain/primitives.js';
import type { Listing, PriceResult } from '../domain/types.js';
import type { ComputeError } from '../domain/errors.js';
import { PricingErrors } from '../domain/errors.js';
import { extractPrices } from './listing.js';

// ---------------------------------------------------------------------------
// Median
// ---------------------------------------------------------------------------

/**
 * Compute the median of a number array.
 *
 * - Sorted ascending (original not mutated).
 * - Even-length arrays return the average of the two middle values.
 *
 * Returns `Option.None` when the array is empty.
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
 * The result may be negative; apply a floor afterwards if needed.
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
 * - Only floor set: `max(price, floor)`
 * - Only ceiling set: `min(price, ceiling)`
 * - Both set: clamp to [floor, ceiling] (ceiling wins if floor > ceiling)
 */
export const applyBounds =
  (floor: Option<Floor>, ceiling: Option<Ceiling>) =>
  (price: number): number => {
    const withFloor = floor.map((f) => Math.max(price, f)).unwrapOr(price);
    return ceiling.map((c) => Math.min(withFloor, c)).unwrapOr(withFloor);
  };

// ---------------------------------------------------------------------------
// computePrice
// ---------------------------------------------------------------------------

/**
 * Given a pool of comparable listings (already filtered), compute a price:
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
  floor: Option<Floor>;
  ceiling: Option<Ceiling>;
  minSample: Option<MinSample>;
}): Result<PriceResult, ComputeError> => {
  const { comparables, increment, floor, ceiling, minSample } = opts;

  const checkMinSample = (
    cs: NonEmptyArray<Listing>,
  ): Result<NonEmptyArray<Listing>, ComputeError> =>
    minSample
      .map(
        (ms): Result<NonEmptyArray<Listing>, ComputeError> =>
          cs.length >= ms
            ? Result.Ok(cs)
            : Result.Err(PricingErrors.insufficientSample(cs.length, ms)),
      )
      .unwrapOr(Result.Ok(cs));

  const toPrice = (base: number): PriceResult => ({
    price: R.pipe(applyIncrement(increment), applyBounds(floor, ceiling))(base),
  });

  return checkMinSample(comparables)
    .map(extractPrices)
    .flatMap((prices) => median(prices).toResult(PricingErrors.noComparables()))
    .map(toPrice);
};
