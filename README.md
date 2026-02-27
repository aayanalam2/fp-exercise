# fp-exercise — Functional Ticket Pricing Engine

A ticket pricing engine written in TypeScript, built as an exercise in applied functional programming. The engine takes a market snapshot (an event and all its current seat listings) plus a set of pricing criteria and produces a recommended price for every seat — with full diagnostic output for each rule evaluated.

---

## What it implements

Given a **market snapshot** — a frozen view of one event and all known seat listings at a point in time — and a **criteria** object that describes how to price seats, the engine:

1. **Validates** that the snapshot and criteria share the same currency.
2. For each seat, **evaluates every pricing rule** in the criteria, in order.
3. Each rule:
   - **Filters** the full listing pool down to a *comparable* set (by currency, price validity, listing age, and spatial scope).
   - Computes a **base price** as the median of comparable listing prices.
   - Applies a signed **increment** (markup or discount) to the base.
   - **Clamps** the result to optional floor and ceiling bounds.
4. The **first rule that succeeds** becomes the seat's recommended price. All rule outcomes (success or failure) are retained as diagnostics.
5. Returns a `PricingReport` with one `SeatRecommendation` per seat.

### Comparable scopes

Three spatial scope types are supported, controlled per rule:

| Scope | Comparables pulled from |
|---|---|
| `zone` | All listings in specified zone IDs |
| `section` | All listings in specified section IDs |
| `proximity` | Sections within `radius` positional steps of `ofSectionId` (sorted lexicographically) |

---

## Architecture

```
src/
├── types.ts      Domain types, output types, error type re-exports
├── errors.ts     Typed error hierarchy (discriminated unions)
├── filters.ts    Pure filter functions that narrow the comparable pool
├── base.ts       Median, increment, bounds, and computePrice
├── rule.ts       Single-rule evaluation and per-seat recommendation
├── engine.ts     Top-level entry point: runPricingEngine
└── index.ts      Public API surface (re-exports)
```

### Data flow

```
MarketSnapshot + Criteria
        │
        ▼
  validateCurrency              (engine.ts)
        │  Result<_, EngineError>
        ▼
  collectSectionIds             (engine.ts)
        │
        ▼
  recommendForSeat ×N seats     (rule.ts)
        │
        ▼
  evaluateRule ×M rules         (rule.ts)
        │
        ├── buildComparableFilter  (filters.ts)
        │     ├── byCurrency
        │     ├── byValidPrice
        │     ├── byMaxAge          Option<number> for ISO parsing
        │     └── byScope           dispatch table over ComparableScope
        │
        └── computePrice           (base.ts)
              ├── median            → Option<number>
              ├── applyIncrement
              └── applyBounds
        │
        ▼
  RuleOutcome[]  →  SeatRecommendation  →  PricingReport
```

The engine returns `Result<PricingReport, EngineError>`. Each rule outcome carries `Result<PriceResult, ComputeError>`. `SeatRecommendation.recommendedPrice` is `Option<PriceResult>`.

---

## Functional programming choices

### No mutation, no side effects

Every function is pure. No variable is ever reassigned. All transformations produce new values. `R.sort` returns a new array (Ramda never mutates). The only impure value in the entire codebase is the `nowMs` default parameter in `runPricingEngine` (`Date.now()`), which is injected so tests can override it deterministically.

### Ramda as the transformation toolkit

[Ramda](https://ramdajs.com) is the sole utility library used for data transformation. Specific choices:

- **`R.filter`** — retains only elements matching a predicate; used everywhere comparables are narrowed.
- **`R.map`** — transforms arrays without mutation; used to evaluate rules and build seat outputs.
- **`R.sort`** — produces a new sorted array; used in `median` (ascending numeric) and `proximitySectionIds` (lexicographic).
- **`R.pipe`** — left-to-right function composition; used in `computePrice` to chain `applyIncrement` and `applyBounds` into a single transformation.
- **`R.find`** — returns the first matching element; used to locate the first successful rule outcome.
- **`R.uniq`** — deduplicates section IDs when building the proximity index.
- **`R.comparator` / `R.lt`** — type-safe comparator construction for `R.sort`.

No `for` loops, `forEach`, or index-based mutation anywhere in the codebase.

### Result monad for error handling

Instead of throwing exceptions or returning `null`/`undefined` on failure, every fallible computation returns a `Result<T, E>` from [`@carbonteq/fp`](https://github.com/carbonteq/fp).

- **`Result.Ok(value)`** — the happy path.
- **`Result.Err(error)`** — a typed failure.
- **`.map(fn)`** — transforms the inner value if Ok; short-circuits on Err. Used in `engine.ts` to sequence currency validation before seat computation without a single `if` check.
- **`.isOk()` / `.isErr()`** — predicate inspection used in `rule.ts` to find the first successful outcome.
- **`.toOption()`** — converts an Ok result to `Option.Some`, used to populate `recommendedPrice`.

The key benefit: **errors cannot be silently ignored**. A caller holding `Result<PricingReport, EngineError>` must explicitly handle both branches.

### Option monad for absent values

`Option<T>` is used wherever a value legitimately may not exist — as opposed to `undefined` or `null`, which carry no semantic information and leak into downstream type signatures.

Two sites in the codebase use `Option`:

1. **`median`** (base.ts) — returns `Option<number>`. An empty array has no median; `Option.None` encodes this without a nullable return type. The consumer (`computePrice`) calls `.unwrapOr(0)` — safe because `computePrice` guards against empty input before calling `median`.

2. **`isoToMs`** (filters.ts, internal) — parses an ISO-8601 string to milliseconds. `Date.parse` returns `NaN` for invalid strings; wrapping in `Option.fromPredicate(value, Number.isFinite)` turns a NaN-or-number into `Option<number>`. The consumer (`byMaxAge`) then calls `.map(ts => ts >= cutoffMs).unwrapOr(false)` — no `Number.isFinite` guard appears anywhere downstream.

3. **`SeatRecommendation.recommendedPrice`** — `Option<PriceResult>`. When every rule fails for a seat, the price is `Option.None` rather than `undefined`.

There are no explicit `=== undefined`, `=== null`, `!= null`, or `!` non-null assertions outside of Ramda interop casts (which are structural necessities of Ramda's type definitions, not logic).

### Strongly-typed error hierarchy

Errors are not strings. Every `Result.Err` carries a discriminated-union member with a unique `type` tag:

```typescript
type ComputeError = NoComparablesError | InsufficientSampleError;
type EngineError  = CurrencyMismatchError;
type PricingError = ComputeError | EngineError;
```

Callers can `switch` on `.type` and TypeScript will enforce exhaustiveness — adding a new error variant causes a compile error at every unhandled match site. Each error type also carries structured payload fields (`actual`, `required`, `eventCurrency`, `criteriaCurrency`) rather than a formatted message string, so callers can format or log errors according to their own conventions.

Errors are constructed exclusively through the `PricingErrors` factory object, which keeps construction logic in one place:

```typescript
PricingErrors.noComparables()
PricingErrors.insufficientSample(actual, required)
PricingErrors.currencyMismatch(eventCurrency, criteriaCurrency)
```

### Dispatch table over `switch`

`byScope` in `filters.ts` selects a handler based on the `ComparableScope` variant. Instead of a `switch` statement, a typed dispatch table is used:

```typescript
const scopeHandlers: {
  [K in ComparableScope['type']]: ScopeHandler<Extract<ComparableScope, { type: K }>>
} = {
  zone:      (scope, _, listings) => ...,
  section:   (scope, _, listings) => ...,
  proximity: (scope, allSectionIds, listings) => ...,
};
```

The mapped type `[K in ComparableScope['type']]` ensures the object must cover every variant of `ComparableScope`. Adding a new scope variant to the union causes a compile error if the handler is missing — the compiler enforces exhaustiveness structurally rather than through a `default: throw` branch.

### Curried, point-free filter functions

Filters are written as curried functions that return `(listings) => Listing[]`. This makes them composable via `R.pipe` and `buildComparableFilter`, and keeps the configuration (currency, age cap, scope) separate from the data being filtered:

```typescript
const byMaxAge = (maxAgeDays: number | undefined, nowMs: number) =>
  (listings: readonly Listing[]): Listing[] => ...
```

`buildComparableFilter` composes `byCurrency`, `byValidPrice`, `byMaxAge`, and `byScope` into a single `listings → Listing[]` function, keeping rule evaluation a simple two-step operation: filter then compute.

---

## Running the project

```bash
npm install

# Type-check only
npm run typecheck

# Run all tests (64 tests, Vitest)
npm test
```

---

## Dependencies

| Package | Role |
|---|---|
| `ramda` | Pure FP utilities (map, filter, sort, pipe, …) |
| `@carbonteq/fp` | `Result<T, E>` and `Option<T>` monads |
| `typescript` | Type system (strict mode, `noUncheckedIndexedAccess`) |
| `vitest` | Test runner |
