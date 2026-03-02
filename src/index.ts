/**
 * Public API — fp-exercise pricing engine
 *
 * Layer map:
 *   domain/primitives  Branded runtime-validated types (ID, CurrencyCode, …)
 *   domain/errors      Typed error hierarchy + PricingErrors constructors
 *   domain/types       All domain interfaces (Listing, PricingRule, …)
 *   core/listing       Listing filters and price extraction
 *   core/pricing       Median, increment, bounds, computePrice
 *   core/rule          Scope resolution, rule evaluation, seat recommendation
 *   engine             runPricingEngine – the top-level entry point
 */

// ---------------------------------------------------------------------------
// Monadic containers
// ---------------------------------------------------------------------------
export { Result, Option } from '@carbonteq/fp';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
export {
  ID,
  Label,
  ISODateString,
  SignedIncrement,
  Radius,
  MinSample,
  MaxAgeDays,
  Floor,
  Ceiling,
  CurrencyCode,
  InvalidIDError,
  InvalidLabelError,
  InvalidISODateStringError,
  InvalidSignedIncrementError,
  InvalidRadiusError,
  InvalidMinSampleError,
  InvalidMaxAgeDaysError,
  InvalidFloorError,
  InvalidCeilingError,
  InvalidCurrencyCodeError,
} from './domain/primitives.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export type {
  CurrencyMismatchError,
  NoComparablesError,
  InsufficientSampleError,
  ComputeError,
  EngineError,
  PricingError,
} from './domain/errors.js';
export { PricingErrors } from './domain/errors.js';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------
export type {
  Unit,
  ListingSnapshot,
  EventMeta,
  Listing,
  MarketSnapshot,
  ComparableScope,
  PricingRule,
  Criteria,
  PriceResult,
  RuleOutcome,
  SeatRecommendation,
  PricingReport,
} from './domain/types.js';

// ---------------------------------------------------------------------------
// Core building blocks
// ---------------------------------------------------------------------------
export { extractPrices, isoToMs, byCurrency, byValidPrice, byMaxAge } from './core/listing.js';
export { median, applyIncrement, applyBounds, computePrice } from './core/pricing.js';
export {
  proximitySectionIds,
  byScope,
  buildComparableFilter,
  evaluateRule,
  recommendForSeat,
} from './core/rule.js';

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
export { runPricingEngine } from './engine.js';
