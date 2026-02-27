// ---------------------------------------------------------------------------
// Domain identifiers
// ---------------------------------------------------------------------------

export type ID = string;
export type Unit = void;
import type { CurrencyCode } from 'currency-codes-ts/dist/types';
export type { CurrencyCode } from 'currency-codes-ts/dist/types';

// ---------------------------------------------------------------------------
// Market data
// ---------------------------------------------------------------------------

/**
 * A point-in-time price snapshot attached to a seat listing.
 * `listedAt` is an ISO-8601 date string (e.g. "2026-02-01T10:00:00Z").
 */
export interface ListingSnapshot {
  listingPrice: number;
  listedAt: string;
  currency: CurrencyCode;
  quantity?: number;
}

export interface EventMeta {
  eventId: ID;
  name: string;
  venue: string;
  dateISO: string;
  currency: CurrencyCode;
}

/** Flat row representing one seat and its current listing details. */
export interface Listing {
  eventId: ID;
  zoneId: ID;
  sectionId: ID;
  seatId: ID;
  zoneLabel: string;
  zoneName?: string;
  sectionLabel: string;
  sectionName?: string;
  seatNumber: string;
  seatLabel?: string;
  fullName?: string;
  listing: ListingSnapshot;
}

/**
 * A market snapshot for a single event – one event + all known listings.
 */
export interface MarketSnapshot {
  event: EventMeta;
  listings: Listing[];
}

// ---------------------------------------------------------------------------
// Pricing criteria
// ---------------------------------------------------------------------------

export type NumericBound = number | undefined;
export type SignedIncrement = number;

/**
 * Defines which comparable listings to pull when computing a base price.
 *
 * - `zone`      – all listings in the given zone IDs
 * - `section`   – all listings in the given section IDs
 * - `proximity` – listings in sections "close to" `ofSectionId` within
 *                 `radius` positional steps (sections sorted lexicographically)
 */
export type ComparableScope =
  | { type: 'zone'; zoneIds: ID[] }
  | { type: 'section'; sectionIds: ID[] }
  | { type: 'proximity'; ofSectionId: ID; radius: number };

export interface PricingRule {
  id: ID;
  label: string;
  /** Which listings count as comparables for this rule. */
  target: ComparableScope;
  /** Amount added to (or subtracted from) the median comparable price. */
  increment: SignedIncrement;
  floor?: NumericBound;
  ceiling?: NumericBound;
  /** Minimum number of valid comparable listings required to produce a price. */
  minSample?: number;
  /** Reject listings older than this many days relative to evaluation time. */
  maxAgeDays?: number;
}

export interface Criteria {
  criteriaId: ID;
  /** ISO 4217 currency code; listings in other currencies are excluded. */
  currency: CurrencyCode;
  rules: PricingRule[];
}

// ---------------------------------------------------------------------------
// Pricing outputs
// ---------------------------------------------------------------------------

import type { Option, Result } from '@carbonteq/fp';
export type { Option, Result } from '@carbonteq/fp';
export type {
  CurrencyMismatchError,
  NoComparablesError,
  InsufficientSampleError,
  ComputeError,
  EngineError,
  PricingError,
} from './errors.js';
import type { ComputeError, EngineError } from './errors.js';

export interface PriceResult {
  price: number;
}

/**
 * Per-rule diagnostic attached to a seat's recommendation.
 *
 * `result` is:
 *   - `Result.Ok(PriceResult)` when the rule produced a price.
 *   - `Result.Err(ComputeError)` when the rule could not produce a price
 *     (empty pool, minSample not met, etc.).
 */
export interface RuleOutcome {
  ruleId: ID;
  ruleLabel: string;
  result: Result<PriceResult, ComputeError>;
}

/** Final recommendation for a single seat. */
export interface SeatRecommendation {
  seatId: ID;
  eventId: ID;
  zoneId: ID;
  sectionId: ID;
  /**
   * The price from the first rule that succeeded (in rule-list order).
   * `Option.None` when every rule failed.
   */
  recommendedPrice: Option<PriceResult>;
  outcomes: RuleOutcome[];
}

/** Top-level output of the pricing engine for a full market snapshot. */
export interface PricingReport {
  criteriaId: ID;
  eventId: ID;
  evaluatedAt: string; // ISO-8601
  seats: SeatRecommendation[];
}
