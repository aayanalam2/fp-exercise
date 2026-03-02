/**
 * @module refined
 *
 * Branded, runtime-validated domain primitive types built with
 * `@carbonteq/refined-type` + Zod.
 *
 * Every type is created via `Type.create(rawValue)` which returns
 * `Result<BrandedType, Error>`.  Use `Type.primitive(branded)` to retrieve the
 * underlying value without the brand.
 *
 * Types defined here:
 *
 *   ID              – non-empty string identifier
 *   Label           – non-empty human-readable display string
 *   ISODateString   – parseable ISO-8601 date/datetime string
 *   SignedIncrement – finite number (pricing delta; may be negative)
 *   Radius          – non-negative integer (proximity scope radius)
 *   MinSample       – positive integer (minimum comparable count)
 *   MaxAgeDays      – positive finite number (listing age cap in days)
 *   Floor           – finite number (price lower bound)
 *   Ceiling         – finite number (price upper bound)
 *   CurrencyCode    – validated ISO 4217 currency code string
 */

import { createRefinedType, RefinedValidationError } from '@carbonteq/refined-type';
import * as z from 'zod/v4';
import { code as lookupCurrency } from 'currency-codes-ts';

// ---------------------------------------------------------------------------
// ID
// ---------------------------------------------------------------------------

export class InvalidIDError extends RefinedValidationError {}

export const ID = createRefinedType(
  'ID',
  z.string().min(1),
  (_data, err) => new InvalidIDError(err),
);
export type ID = typeof ID.$infer;

// ---------------------------------------------------------------------------
// ISODateString
// ---------------------------------------------------------------------------

export class InvalidISODateStringError extends RefinedValidationError {}

export const ISODateString = createRefinedType(
  'ISODateString',
  z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid ISO date string'),
  (_data, err) => new InvalidISODateStringError(err),
);
export type ISODateString = typeof ISODateString.$infer;

// ---------------------------------------------------------------------------
// SignedIncrement
// ---------------------------------------------------------------------------

export class InvalidSignedIncrementError extends RefinedValidationError {}

export const SignedIncrement = createRefinedType(
  'SignedIncrement',
  z.number(),
  (_data, err) => new InvalidSignedIncrementError(err),
);
export type SignedIncrement = typeof SignedIncrement.$infer;

// ---------------------------------------------------------------------------
// Radius
// ---------------------------------------------------------------------------

export class InvalidRadiusError extends RefinedValidationError {}

export const Radius = createRefinedType(
  'Radius',
  z.number().int().nonnegative(),
  (_data, err) => new InvalidRadiusError(err),
);
export type Radius = typeof Radius.$infer;

// ---------------------------------------------------------------------------
// MinSample
// ---------------------------------------------------------------------------

export class InvalidMinSampleError extends RefinedValidationError {}

export const MinSample = createRefinedType(
  'MinSample',
  z.number().int().positive(),
  (_data, err) => new InvalidMinSampleError(err),
);
export type MinSample = typeof MinSample.$infer;

// ---------------------------------------------------------------------------
// MaxAgeDays
// ---------------------------------------------------------------------------

export class InvalidMaxAgeDaysError extends RefinedValidationError {}

export const MaxAgeDays = createRefinedType(
  'MaxAgeDays',
  z.number().positive(),
  (_data, err) => new InvalidMaxAgeDaysError(err),
);
export type MaxAgeDays = typeof MaxAgeDays.$infer;

// ---------------------------------------------------------------------------
// Floor
// ---------------------------------------------------------------------------

export class InvalidFloorError extends RefinedValidationError {}

export const Floor = createRefinedType(
  'Floor',
  z.number(),
  (_data, err) => new InvalidFloorError(err),
);
export type Floor = typeof Floor.$infer;

// ---------------------------------------------------------------------------
// Ceiling
// ---------------------------------------------------------------------------

export class InvalidCeilingError extends RefinedValidationError {}

export const Ceiling = createRefinedType(
  'Ceiling',
  z.number(),
  (_data, err) => new InvalidCeilingError(err),
);
export type Ceiling = typeof Ceiling.$infer;

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------

export class InvalidLabelError extends RefinedValidationError {}

export const Label = createRefinedType(
  'Label',
  z.string().min(1),
  (_data, err) => new InvalidLabelError(err),
);
export type Label = typeof Label.$infer;

// ---------------------------------------------------------------------------
// CurrencyCode
// ---------------------------------------------------------------------------

export class InvalidCurrencyCodeError extends RefinedValidationError {}

export const CurrencyCode = createRefinedType(
  'CurrencyCode',
  z.string().refine((s) => lookupCurrency(s) !== undefined, 'Invalid ISO 4217 currency code'),
  (_data, err) => new InvalidCurrencyCodeError(err),
);
export type CurrencyCode = typeof CurrencyCode.$infer;
