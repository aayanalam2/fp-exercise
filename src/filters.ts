/**
 * @module filters
 *
 * Pure functions that narrow a pool of Listing rows before price computation.
 *
 */

import * as R from 'ramda';
import type {
  Listing,
  ComparableScope,
  ID,
  CurrencyCode,
  MaxAgeDays,
  Radius,
  ISODateString,
} from './types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Milliseconds in one day – computed once and frozen.
 */
const MS_PER_DAY = 86_400_000 as const;

/**
 * Parse a validated ISO-8601 date string to a UTC timestamp (ms).
 * Because `ISODateString` is always parseable, this always returns a number.
 */
const isoToMs = (iso: ISODateString): number => Date.parse(iso);

// ---------------------------------------------------------------------------
// Currency filter
// ---------------------------------------------------------------------------

/**
 * Retain only listings whose `listing.currency` matches the criteria currency.
 * Comparison is case-insensitive.
 */
export const byCurrency =
  (currency: CurrencyCode) =>
  (listings: readonly Listing[]): Listing[] =>
    R.filter((l) => l.listing.currency === currency, listings as Listing[]);

// ---------------------------------------------------------------------------
// Valid-price filter
// ---------------------------------------------------------------------------

/**
 * Remove listings with non-finite `listingPrice` (NaN, +Infinity, -Infinity)
 * or prices ≤ 0 (a zero or negative market price is nonsensical).
 */
export const byValidPrice = (listings: readonly Listing[]): Listing[] =>
  R.filter(
    (l) => Number.isFinite(l.listing.listingPrice) && l.listing.listingPrice > 0,
    listings as Listing[],
  );

// ---------------------------------------------------------------------------
// Staleness filter
// ---------------------------------------------------------------------------

/**
 * When `maxAgeDays` is defined, discard listings whose `listedAt` timestamp
 * is older than `maxAgeDays` days before `nowMs`.
 *
 * Listings with an unparseable `listedAt` value are always removed when an
 * age cap is active.
 */
export const byMaxAge =
  (maxAgeDays: MaxAgeDays | undefined, nowMs: number) =>
  (listings: readonly Listing[]): Listing[] => {
    if (maxAgeDays === undefined) return listings as Listing[];
    const cutoffMs = nowMs - maxAgeDays * MS_PER_DAY;
    return R.filter((l) => isoToMs(l.listing.listedAt) >= cutoffMs, listings as Listing[]);
  };

// ---------------------------------------------------------------------------
// Scope filter
// ---------------------------------------------------------------------------

/**
 * For `proximity` scope: given all distinct section IDs present in the
 * snapshot sorted lexicographically, return IDs whose sorted index is within
 * `radius` steps of the `ofSectionId` index.
 *
 * If `ofSectionId` does not appear in `allSectionIds` the function returns
 * an empty array so the rule safely produces no price.
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

/**
 * Filter listings down to those matching the given `ComparableScope`.
 *
 * `allSectionIds` must be the complete sorted list of distinct section IDs
 * in the snapshot – it is only used when scope type is `proximity`.
 */

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

export const byScope =
  (scope: ComparableScope, allSectionIds: readonly ID[]) =>
  (listings: readonly Listing[]): Listing[] =>
    (scopeHandlers[scope.type] as ScopeHandler<ComparableScope>)(
      scope,
      allSectionIds,
      listings as Listing[],
    );

// ---------------------------------------------------------------------------
// Composite pipeline builder
// ---------------------------------------------------------------------------

/**
 * Build the full comparable-selection pipeline for a single rule.
 *
 * Applies in order:
 *   1. Currency match
 *   2. Valid (finite, positive) price
 *   3. Age cap (if `maxAgeDays` is set)
 *   4. Scope selection
 */
export const buildComparableFilter = (opts: {
  currency: CurrencyCode;
  scope: ComparableScope;
  maxAgeDays: MaxAgeDays | undefined;
  allSectionIds: readonly ID[];
  nowMs: number;
}) =>
  R.pipe(
    byCurrency(opts.currency),
    byValidPrice,
    byMaxAge(opts.maxAgeDays, opts.nowMs),
    byScope(opts.scope, opts.allSectionIds),
  );
