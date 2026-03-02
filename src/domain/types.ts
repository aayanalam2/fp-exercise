/**
 * @module types
 *
 * All domain interfaces: market data shapes, rule configuration, and pricing
 * engine inputs/outputs.
 */

import type { Option, Result } from '@carbonteq/fp';
import type {
  ID,
  Label,
  ISODateString,
  CurrencyCode,
  SignedIncrement,
  Floor,
  Ceiling,
  MinSample,
  MaxAgeDays,
  Radius,
} from './primitives.js';
import type { ComputeError } from './errors.js';

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export type Unit = void;

// ---------------------------------------------------------------------------
// Market data
// ---------------------------------------------------------------------------

/**
 * A point-in-time price snapshot attached to a seat listing.
 */
export interface ListingSnapshot {
  listingPrice: number;
  listedAt: ISODateString;
  currency: CurrencyCode;
  quantity: Option<number>;
}

export interface EventMeta {
  eventId: ID;
  name: string;
  venue: string;
  dateISO: ISODateString;
  currency: CurrencyCode;
}

/** Flat row representing one seat and its current listing details. */
export interface Listing {
  eventId: ID;
  zoneId: ID;
  sectionId: ID;
  seatId: ID;
  zoneLabel: string;
  zoneName: Option<string>;
  sectionLabel: string;
  sectionName: Option<string>;
  seatNumber: string;
  seatLabel: Option<string>;
  fullName: Option<string>;
  listing: ListingSnapshot;
}

/** A market snapshot for a single event – one event + all known listings. */
export interface MarketSnapshot {
  event: EventMeta;
  listings: Listing[];
}

// ---------------------------------------------------------------------------
// Rule configuration
// ---------------------------------------------------------------------------

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
  | { type: 'proximity'; ofSectionId: ID; radius: Radius };

export interface PricingRule {
  id: ID;
  label: Label;
  /** Which listings count as comparables for this rule. */
  target: ComparableScope;
  /** Amount added to (or subtracted from) the median comparable price. */
  increment: SignedIncrement;
  floor: Option<Floor>;
  ceiling: Option<Ceiling>;
  /** Minimum number of valid comparable listings required to produce a price. */
  minSample: Option<MinSample>;
  /** Reject listings older than this many days relative to evaluation time. */
  maxAgeDays: Option<MaxAgeDays>;
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

export interface PriceResult {
  price: number;
}

/**
 * Per-rule diagnostic attached to a seat's recommendation.
 *
 * `result` is `Result.Ok(PriceResult)` on success or `Result.Err(ComputeError)`
 * when the rule could not produce a price.
 */
export interface RuleOutcome {
  ruleId: ID;
  ruleLabel: Label;
  result: Result<PriceResult, ComputeError>;
}

/** Final recommendation for a single seat. */
export interface SeatRecommendation {
  seatId: ID;
  eventId: ID;
  zoneId: ID;
  sectionId: ID;
  /** The price from the first rule that succeeded. `None` when every rule failed. */
  recommendedPrice: Option<PriceResult>;
  outcomes: RuleOutcome[];
}

/** Top-level output of the pricing engine for a full market snapshot. */
export interface PricingReport {
  criteriaId: ID;
  eventId: ID;
  evaluatedAt: ISODateString;
  seats: SeatRecommendation[];
}
