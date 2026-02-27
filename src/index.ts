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

// Types
export type {
  ID,
  CurrencyCode,
  ListingSnapshot,
  EventMeta,
  Listing,
  MarketSnapshot,
  NumericBound,
  SignedIncrement,
  ComparableScope,
  PricingRule,
  Criteria,
  PriceResult,
  RuleOutcome,
  SeatRecommendation,
  PricingReport,
} from './types.js';

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
