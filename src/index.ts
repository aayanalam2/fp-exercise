/**
 * Public API surface for the fp-exercise pricing library.
 */

// Monadic primitives (re-exported for consumers)
export { Result, Option } from '@carbonteq/fp';

// Typed error hierarchy
export type {
  CurrencyMismatchError,
  NoComparablesError,
  InsufficientSampleError,
  ComputeError,
  EngineError,
  PricingError,
} from './errors.js';
export { PricingErrors } from './errors.js';

// Refined type validation errors
export {
  InvalidIDError,
  InvalidSignedIncrementError,
  InvalidRadiusError,
  InvalidMinSampleError,
  InvalidMaxAgeDaysError,
  InvalidFloorError,
  InvalidCeilingError,
  InvalidCurrencyCodeError,
} from './refined.js';

// Types
export type {
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
} from './types.js';

// Refined branded types (values + types)
export {
  ID,
  SignedIncrement,
  Radius,
  MinSample,
  MaxAgeDays,
  Floor,
  Ceiling,
  CurrencyCode,
} from './refined.js';

// Engine
export { runPricingEngine } from './engine.js';

// Lower-level building blocks (useful for testing / composition)
export {
  byCurrency,
  byValidPrice,
  byMaxAge,
  byScope,
  proximitySectionIds,
  buildComparableFilter,
} from './filters.js';

export { extractPrices, median, applyIncrement, applyBounds, computePrice } from './base.js';

export { evaluateRule, recommendForSeat } from './rule.js';
