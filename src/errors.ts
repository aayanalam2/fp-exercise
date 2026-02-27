/**
 * @module errors
 *
 * Strongly-typed, exhaustive error hierarchy for the pricing engine.
 *
 * Every failure that can propagate through a `Result.Err` is represented as a
 * discriminated-union member with a unique `type` tag.  Callers can pattern-
 * match on `type` and the TypeScript compiler will enforce exhaustiveness.
 *
 * Layers
 * ──────
 * • `ComputeError`  – failures inside a single rule's price computation
 * • `EngineError`   – failures at the top-level engine entry point
 * • `PricingError`  – full union (ComputeError | EngineError)
 */

// ---------------------------------------------------------------------------
// Leaf error types
// ---------------------------------------------------------------------------

/**
 * The criteria currency does not match the event currency in the snapshot.
 * The caller must normalize currencies before invoking the engine.
 */
import type { CurrencyCode } from 'currency-codes-ts/dist/types';

export interface CurrencyMismatchError {
  readonly type: 'CurrencyMismatchError';
  /** ISO 4217 code from the event (e.g. "EUR"). */
  readonly eventCurrency: CurrencyCode;
  /** ISO 4217 code from the criteria (e.g. "USD"). */
  readonly criteriaCurrency: CurrencyCode;
}

/**
 * After applying all filters (currency, validity, age, scope) the comparable
 * pool for a rule is empty – no base price can be derived.
 */
export interface NoComparablesError {
  readonly type: 'NoComparablesError';
}

/**
 * The comparable pool exists but is smaller than the rule's `minSample`
 * threshold.
 */
export interface InsufficientSampleError {
  readonly type: 'InsufficientSampleError';
  /** Number of valid comparables that were found. */
  readonly actual: number;
  /** Minimum required by the rule's `minSample` configuration. */
  readonly required: number;
}

// ---------------------------------------------------------------------------
// Composite union types
// ---------------------------------------------------------------------------

/** Every error that can occur during per-rule price computation. */
export type ComputeError = NoComparablesError | InsufficientSampleError;

/** Every error that can occur at the top-level engine entry point. */
export type EngineError = CurrencyMismatchError;

/** Full union of every error the pricing system can produce. */
export type PricingError = ComputeError | EngineError;

// ---------------------------------------------------------------------------
// Pure constructor helpers
// ---------------------------------------------------------------------------

export const PricingErrors = {
  currencyMismatch: (
    eventCurrency: CurrencyCode,
    criteriaCurrency: CurrencyCode,
  ): CurrencyMismatchError => ({
    type: 'CurrencyMismatchError',
    eventCurrency,
    criteriaCurrency,
  }),

  noComparables: (): NoComparablesError => ({
    type: 'NoComparablesError',
  }),

  insufficientSample: (actual: number, required: number): InsufficientSampleError => ({
    type: 'InsufficientSampleError',
    actual,
    required,
  }),
} as const;
