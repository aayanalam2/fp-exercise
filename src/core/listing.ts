/**
 * @module core/listing
 *
 * Pure functions that operate on listing data:
 *   - `extractPrices`  – pluck listingPrice from a pool
 *   - `byCurrency`     – match listing currency to criteria currency
 *   - `byValidPrice`   – reject non-finite or non-positive prices
 *   - `byMaxAge`       – reject stale listings based on `listedAt`
 */

import * as R from 'ramda';
import type { NonEmptyArray } from 'ramda';
import { Option } from '@carbonteq/fp';
import type { ISODateString, CurrencyCode, MaxAgeDays } from '../domain/primitives.js';
import type { Listing } from '../domain/types.js';

// ---------------------------------------------------------------------------
// Price extraction
// ---------------------------------------------------------------------------

/** Pluck the numeric `listingPrice` from each listing in a non-empty array. */
export const extractPrices = (listings: NonEmptyArray<Listing>): number[] =>
  R.map((l) => l.listing.listingPrice, listings);

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000 as const;

/**
 * Parse a validated ISO-8601 date string to a UTC timestamp (ms).
 * Because `ISODateString` is always parseable, this always returns a number.
 */
export const isoToMs = (iso: ISODateString): number => Date.parse(iso);

/** Retain only listings whose currency matches the criteria currency. */
export const byCurrency =
  (currency: CurrencyCode) =>
  (listings: readonly Listing[]): Listing[] =>
    R.filter((l) => l.listing.currency === currency, listings as Listing[]);

/**
 * Remove listings with non-finite `listingPrice` (NaN, ±Infinity) or prices ≤ 0.
 */
export const byValidPrice = (listings: readonly Listing[]): Listing[] =>
  R.filter(
    (l) => Number.isFinite(l.listing.listingPrice) && l.listing.listingPrice > 0,
    listings as Listing[],
  );

/**
 * When `maxAgeDays` is defined, discard listings whose `listedAt` timestamp
 * is older than `maxAgeDays` days before `nowMs`.
 */
export const byMaxAge =
  (maxAgeDays: Option<MaxAgeDays>, nowMs: number) =>
  (listings: readonly Listing[]): Listing[] =>
    maxAgeDays
      .map((days) => {
        const cutoffMs = nowMs - days * MS_PER_DAY;
        return R.filter(
          (l: Listing) => isoToMs(l.listing.listedAt) >= cutoffMs,
          listings as Listing[],
        );
      })
      .unwrapOr(listings as Listing[]);
