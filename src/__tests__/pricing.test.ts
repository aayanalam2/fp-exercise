/**
 * Vitest test suite for the functional pricing engine.
 *
 * All assertions use the monadic @carbonteq/fp API:
 *   - `Result.isOk()` / `Result.isErr()` for branching
 *   - `Result.unwrap()` / `Result.unwrapErr()` to extract values
 *   - `Option.isSome()` / `Option.isNone()` for optional recommendations
 *   - `Option.unwrap()` to extract an Option value
 *
 * Tests are grouped by logical layer:
 *   1. Base computations  (median, applyIncrement, applyBounds, computePrice)
 *   2. Refined type validation (CurrencyCode, ISODateString)
 *   3. Filters            (byCurrency, byValidPrice, byMaxAge, byScope, proximity)
 *   4. Rule evaluation    (evaluateRule, recommendForSeat)
 *   5. Integration        (runPricingEngine – full pipeline)
 *   6. Edge cases         (empty pool, minSample, stale, bad currency, ±Inf/NaN)
 */

import { describe, it, expect } from 'vitest';
import { faker } from '@faker-js/faker';
import { Option } from '@carbonteq/fp';
import type { NonEmptyArray } from 'ramda';
import type { Listing, MarketSnapshot, Criteria, PricingRule, ComparableScope } from '../index.js';
import {
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
  InvalidCurrencyCodeError,
  InvalidISODateStringError,
  median,
  applyIncrement,
  applyBounds,
  computePrice,
  byCurrency,
  byValidPrice,
  byMaxAge,
  byScope,
  proximitySectionIds,
  evaluateRule,
  recommendForSeat,
  runPricingEngine,
} from '../index.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const NOW = Date.parse('2026-02-27T12:00:00Z');
const RECENT = '2026-02-26T10:00:00Z'; // ~26 hours ago – within any reasonable window
const STALE = '2025-12-01T00:00:00Z'; // ~88 days ago

// ---------------------------------------------------------------------------
// Branded-type construction helpers — each runs Zod validation via .create()
// ---------------------------------------------------------------------------

const id = (s: string) => ID.create(s).unwrap();
const inc = (n: number) => SignedIncrement.create(n).unwrap();
const rad = (n: number) => Radius.create(n).unwrap();
const mins = (n: number) => MinSample.create(n).unwrap();
const maxd = (n: number) => MaxAgeDays.create(n).unwrap();
const fl = (n: number) => Floor.create(n).unwrap();
const ceil = (n: number) => Ceiling.create(n).unwrap();
const ccy = (s: string) => CurrencyCode.create(s).unwrap();

// ---------------------------------------------------------------------------
// Scope conversion helper
// ---------------------------------------------------------------------------

type RawScope =
  | { type: 'zone'; zoneIds: string[] }
  | { type: 'section'; sectionIds: string[] }
  | { type: 'proximity'; ofSectionId: string; radius: number };

const toScope = (raw: RawScope): ComparableScope => {
  if (raw.type === 'zone') return { type: 'zone', zoneIds: raw.zoneIds.map(id) };
  if (raw.type === 'section') return { type: 'section', sectionIds: raw.sectionIds.map(id) };
  return { type: 'proximity', ofSectionId: id(raw.ofSectionId), radius: rad(raw.radius) };
};

type ListingOverrides = {
  eventId?: string;
  seatId?: string;
  zoneId?: string;
  sectionId?: string;
  price?: number;
  currency?: string;
  listedAt?: string;
};

const makeListing = (overrides: ListingOverrides = {}): Listing => ({
  eventId: id(overrides.eventId ?? 'evt-1'),
  zoneId: id(overrides.zoneId ?? 'z1'),
  sectionId: id(overrides.sectionId ?? 's1'),
  seatId: id(overrides.seatId ?? 'seat-1'),
  zoneLabel: faker.word.words(2),
  zoneName: Option.None,
  sectionLabel: faker.word.words(2),
  sectionName: Option.None,
  seatNumber: faker.number.int({ min: 1, max: 999 }).toString(),
  seatLabel: Option.None,
  fullName: Option.None,
  listing: {
    listingPrice: overrides.price ?? faker.number.float({ min: 10, max: 500, fractionDigits: 2 }),
    listedAt: isoDate(overrides.listedAt ?? RECENT),
    currency: ccy(overrides.currency ?? 'USD'),
    quantity: Option.None,
  },
});

// A minimal valid market snapshot
const makeMarket = (listings: Listing[]): MarketSnapshot => ({
  event: {
    eventId: id('evt-1'),
    name: faker.company.name(),
    venue: faker.location.city(),
    dateISO: isoDate(faker.date.future({ years: 1 }).toISOString()),
    currency: ccy('USD'),
  },
  listings,
});

type RuleOverrides = {
  id?: string;
  label?: string;
  target?: RawScope;
  increment?: number;
  floor?: number;
  ceiling?: number;
  minSample?: number;
  maxAgeDays?: number;
};

const lbl = (s: string) => Label.create(s).unwrap();
const isoDate = (s: string) => ISODateString.create(s).unwrap();

const makeRule = (overrides: RuleOverrides = {}): PricingRule => ({
  id: id(overrides.id ?? 'r1'),
  label: lbl(overrides.label ?? faker.word.words(3)),
  target: toScope(overrides.target ?? { type: 'zone', zoneIds: ['z1'] }),
  increment: inc(overrides.increment ?? 0),
  floor: overrides.floor !== undefined ? Option.Some(fl(overrides.floor)) : Option.None,
  ceiling: overrides.ceiling !== undefined ? Option.Some(ceil(overrides.ceiling)) : Option.None,
  minSample:
    overrides.minSample !== undefined ? Option.Some(mins(overrides.minSample)) : Option.None,
  maxAgeDays:
    overrides.maxAgeDays !== undefined ? Option.Some(maxd(overrides.maxAgeDays)) : Option.None,
});

const makeCriteria = (rules: PricingRule[] = [makeRule()]): Criteria => ({
  criteriaId: id('c1'),
  currency: ccy('USD'),
  rules,
});

// ---------------------------------------------------------------------------
// 1. Base computations
// ---------------------------------------------------------------------------

describe('median', () => {
  it('returns None for an empty array', () => {
    expect(median([]).isNone()).toBe(true);
  });

  it('returns Some with the single element for a 1-element array', () => {
    expect(median([42]).unwrap()).toBe(42);
  });

  it('returns Some with the middle element for an odd-length array', () => {
    expect(median([3, 1, 2]).unwrap()).toBe(2);
  });

  it('returns Some with the average of two middle values for an even-length array', () => {
    expect(median([4, 1, 3, 2]).unwrap()).toBe(2.5);
  });

  it('does not mutate the input array', () => {
    const input = [5, 3, 1];
    median(input);
    expect(input).toEqual([5, 3, 1]);
  });
});

describe('applyIncrement', () => {
  it('adds a positive increment', () => {
    expect(applyIncrement(10)(100)).toBe(110);
  });

  it('subtracts when increment is negative', () => {
    expect(applyIncrement(-15)(100)).toBe(85);
  });

  it('returns base unchanged when increment is 0', () => {
    expect(applyIncrement(0)(50)).toBe(50);
  });
});

describe('applyBounds', () => {
  it('clamps to floor when price is below floor', () => {
    expect(applyBounds(Option.Some(fl(50)), Option.None)(30)).toBe(50);
  });

  it('does not change price already above floor', () => {
    expect(applyBounds(Option.Some(fl(50)), Option.None)(80)).toBe(80);
  });

  it('clamps to ceiling when price is above ceiling', () => {
    expect(applyBounds(Option.None, Option.Some(ceil(200)))(250)).toBe(200);
  });

  it('does not change price already below ceiling', () => {
    expect(applyBounds(Option.None, Option.Some(ceil(200)))(150)).toBe(150);
  });

  it('applies both floor and ceiling together', () => {
    expect(applyBounds(Option.Some(fl(50)), Option.Some(ceil(200)))(300)).toBe(200);
    expect(applyBounds(Option.Some(fl(50)), Option.Some(ceil(200)))(10)).toBe(50);
    expect(applyBounds(Option.Some(fl(50)), Option.Some(ceil(200)))(100)).toBe(100);
  });

  it('ceiling wins when floor > ceiling (defensive clamp)', () => {
    // floor=200, ceiling=100 → floored=200 → capped to 100
    expect(applyBounds(Option.Some(fl(200)), Option.Some(ceil(100)))(50)).toBe(100);
  });

  it('returns price unchanged when both bounds are None', () => {
    expect(applyBounds(Option.None, Option.None)(75)).toBe(75);
  });
});

describe('computePrice', () => {
  const base = [makeListing({ price: 100 }), makeListing({ price: 200 })] as NonEmptyArray<Listing>;

  it('returns Ok with a price for a valid comparable set', () => {
    const out = computePrice({
      comparables: base,
      increment: 0,
      floor: Option.None,
      ceiling: Option.None,
      minSample: Option.None,
    });
    expect(out.isOk()).toBe(true);
    expect(out.unwrap().price).toBe(150); // median of [100, 200]
  });

  it('applies the increment', () => {
    const out = computePrice({
      comparables: base,
      increment: 25,
      floor: Option.None,
      ceiling: Option.None,
      minSample: Option.None,
    });
    expect(out.isOk()).toBe(true);
    expect(out.unwrap().price).toBe(175);
  });

  it('returns Err when minSample not met', () => {
    const single = [makeListing({ price: 100 })] as NonEmptyArray<Listing>;
    const out = computePrice({
      comparables: single,
      increment: 0,
      floor: Option.None,
      ceiling: Option.None,
      minSample: Option.Some(mins(3)),
    });
    expect(out.isErr()).toBe(true);
    expect(out.unwrapErr().type).toBe('InsufficientSampleError');
    expect((out.unwrapErr() as import('../index.js').InsufficientSampleError).actual).toBe(1);
    expect((out.unwrapErr() as import('../index.js').InsufficientSampleError).required).toBe(3);
  });

  it('applies floor after increment', () => {
    // median=100, increment=-80 → 20, floor=50 → 50
    const out = computePrice({
      comparables: [makeListing({ price: 100 })] as NonEmptyArray<Listing>,
      increment: -80,
      floor: Option.Some(fl(50)),
      ceiling: Option.None,
      minSample: Option.None,
    });
    expect(out.isOk()).toBe(true);
    expect(out.unwrap().price).toBe(50);
  });

  it('applies ceiling after increment', () => {
    // median=100, increment=100 → 200, ceiling=150 → 150
    const out = computePrice({
      comparables: [makeListing({ price: 100 })] as NonEmptyArray<Listing>,
      increment: 100,
      floor: Option.None,
      ceiling: Option.Some(ceil(150)),
      minSample: Option.None,
    });
    expect(out.isOk()).toBe(true);
    expect(out.unwrap().price).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// 2. Refined type validation
// ---------------------------------------------------------------------------

describe('CurrencyCode', () => {
  it('creates Ok for a valid ISO 4217 code', () => {
    const result = CurrencyCode.create('USD');
    expect(result.isOk()).toBe(true);
    expect(result.unwrap()).toBe('USD');
  });

  it('creates Err for an unrecognised currency string', () => {
    const result = CurrencyCode.create('INVALID');
    expect(result.isErr()).toBe(true);
    expect(result.unwrapErr()).toBeInstanceOf(InvalidCurrencyCodeError);
  });

  it('creates Err for an empty string', () => {
    expect(CurrencyCode.create('').isErr()).toBe(true);
  });

  it('creates Err for a numeric string', () => {
    expect(CurrencyCode.create('840').isErr()).toBe(true);
  });
});

describe('ISODateString', () => {
  it('creates Ok for a valid ISO 8601 datetime string', () => {
    const result = ISODateString.create('2026-02-27T12:00:00Z');
    expect(result.isOk()).toBe(true);
    expect(result.unwrap()).toBe('2026-02-27T12:00:00Z');
  });

  it('creates Ok for a date-only string (no time component)', () => {
    expect(ISODateString.create('2026-03-15').isOk()).toBe(true);
  });

  it('creates Err for an unparseable string', () => {
    const result = ISODateString.create('not-a-date');
    expect(result.isErr()).toBe(true);
    expect(result.unwrapErr()).toBeInstanceOf(InvalidISODateStringError);
  });

  it('creates Err for an empty string', () => {
    expect(ISODateString.create('').isErr()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Filters
// ---------------------------------------------------------------------------

describe('byCurrency', () => {
  it('keeps listings matching the criteria currency', () => {
    const listings = [
      makeListing({ currency: 'USD' }),
      makeListing({ currency: 'EUR' }),
      makeListing({ currency: 'GBP' }),
    ];
    const result = byCurrency(ccy('USD'))(listings);
    expect(result).toHaveLength(1);
  });

  it('returns empty when no currency matches', () => {
    const listings = [makeListing({ currency: 'GBP' })];
    expect(byCurrency(ccy('USD'))(listings)).toHaveLength(0);
  });
});

describe('byValidPrice', () => {
  it('filters out NaN prices', () => {
    const listings = [makeListing({ price: NaN }), makeListing({ price: 100 })];
    expect(byValidPrice(listings)).toHaveLength(1);
  });

  it('filters out +Infinity', () => {
    const listings = [makeListing({ price: Infinity }), makeListing({ price: 50 })];
    expect(byValidPrice(listings)).toHaveLength(1);
  });

  it('filters out -Infinity', () => {
    const listings = [makeListing({ price: -Infinity }), makeListing({ price: 50 })];
    expect(byValidPrice(listings)).toHaveLength(1);
  });

  it('filters out zero prices', () => {
    const listings = [makeListing({ price: 0 }), makeListing({ price: 50 })];
    expect(byValidPrice(listings)).toHaveLength(1);
  });

  it('filters out negative prices', () => {
    const listings = [makeListing({ price: -10 }), makeListing({ price: 50 })];
    expect(byValidPrice(listings)).toHaveLength(1);
  });

  it('keeps all valid positive finite prices', () => {
    const listings = [makeListing({ price: 0.01 }), makeListing({ price: 999 })];
    expect(byValidPrice(listings)).toHaveLength(2);
  });
});

describe('byMaxAge', () => {
  it('returns all listings when maxAgeDays is None', () => {
    const listings = [makeListing({ listedAt: STALE })];
    expect(byMaxAge(Option.None, NOW)(listings)).toHaveLength(1);
  });

  it('retains recent listings within the age window', () => {
    const listings = [makeListing({ listedAt: RECENT })];
    expect(byMaxAge(Option.Some(maxd(7)), NOW)(listings)).toHaveLength(1);
  });

  it('removes stale listings beyond the age cap', () => {
    const listings = [makeListing({ listedAt: STALE })];
    expect(byMaxAge(Option.Some(maxd(7)), NOW)(listings)).toHaveLength(0);
  });

  it('removes listings with unparseable listedAt when age cap active', () => {
    expect(ISODateString.create('not-a-date').isErr()).toBe(true);
    expect(ISODateString.create('not-a-date').unwrapErr()).toBeInstanceOf(
      InvalidISODateStringError,
    );
  });

  it('keeps listing listed exactly at the cutoff boundary', () => {
    // Exactly 7 days before NOW to the millisecond → should be retained
    const exactCutoff = new Date(NOW - 7 * 86_400_000).toISOString();
    const listings = [makeListing({ listedAt: exactCutoff })];
    expect(byMaxAge(Option.Some(maxd(7)), NOW)(listings)).toHaveLength(1);
  });
});

describe('byScope – zone', () => {
  it('keeps listings in the allowed zone IDs', () => {
    const listings = [
      makeListing({ zoneId: 'z1' }),
      makeListing({ zoneId: 'z2' }),
      makeListing({ zoneId: 'z3' }),
    ];
    const result = byScope({ type: 'zone', zoneIds: [id('z1'), id('z3')] }, [])(listings);
    expect(result.map((l) => l.zoneId)).toEqual(['z1', 'z3']);
  });

  it('returns empty when no zone matches', () => {
    const listings = [makeListing({ zoneId: 'z99' })];
    expect(byScope({ type: 'zone', zoneIds: [id('z1')] }, [])(listings)).toHaveLength(0);
  });
});

describe('byScope – section', () => {
  it('keeps listings in the allowed section IDs', () => {
    const listings = [makeListing({ sectionId: 's1' }), makeListing({ sectionId: 's2' })];
    const result = byScope({ type: 'section', sectionIds: [id('s1')] }, [])(listings);
    expect(result).toHaveLength(1);
    expect(result[0]!.sectionId).toBe('s1');
  });
});

describe('proximitySectionIds', () => {
  const allIds = ['s1', 's2', 's3', 's4', 's5'].map(id);

  it('returns only the target when radius = 0', () => {
    expect(proximitySectionIds(allIds, id('s3'), rad(0))).toEqual(['s3']);
  });

  it('returns neighbours within radius', () => {
    expect(proximitySectionIds(allIds, id('s3'), rad(1))).toEqual(['s2', 's3', 's4']);
  });

  it('does not go below index 0', () => {
    expect(proximitySectionIds(allIds, id('s1'), rad(2))).toEqual(['s1', 's2', 's3']);
  });

  it('does not go above last index', () => {
    expect(proximitySectionIds(allIds, id('s5'), rad(2))).toEqual(['s3', 's4', 's5']);
  });

  it('returns empty array when ofSectionId is not in the list', () => {
    expect(proximitySectionIds(allIds, id('sX'), rad(2))).toEqual([]);
  });
});

describe('byScope – proximity', () => {
  it('keeps listings in proximate sections', () => {
    const allSectionIds = ['s1', 's2', 's3', 's4', 's5'].map(id);
    const listings = ['s1', 's2', 's3', 's4', 's5'].map((sid) => makeListing({ sectionId: sid }));
    const result = byScope(
      { type: 'proximity', ofSectionId: id('s3'), radius: rad(1) },
      allSectionIds,
    )(listings);
    expect(result.map((l) => l.sectionId).sort()).toEqual(['s2', 's3', 's4']);
  });

  it('returns empty when ofSectionId is not present', () => {
    const listings = [makeListing({ sectionId: 's1' })];
    const result = byScope({ type: 'proximity', ofSectionId: id('sX'), radius: rad(2) }, [
      id('s1'),
    ])(listings);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Rule evaluation
// ---------------------------------------------------------------------------

describe('evaluateRule', () => {
  it('produces Ok with a price when valid comparables exist', () => {
    const listings = [
      makeListing({ zoneId: 'z1', price: 100 }),
      makeListing({ zoneId: 'z1', price: 200 }),
    ];
    const rule = makeRule({ target: { type: 'zone', zoneIds: ['z1'] }, increment: 10 });
    const outcome = evaluateRule(rule, listings, ccy('USD'), [id('s1')], NOW);
    // median(100, 200) = 150 + 10 = 160
    expect(outcome.result.isOk()).toBe(true);
    expect(outcome.result.unwrap().price).toBe(160);
    expect(outcome.ruleId).toBe('r1');
  });

  it('returns Err when no comparables in target zone', () => {
    const listings = [makeListing({ zoneId: 'z2', price: 100 })];
    const rule = makeRule({ target: { type: 'zone', zoneIds: ['z1'] } });
    const outcome = evaluateRule(rule, listings, ccy('USD'), [id('s1')], NOW);
    expect(outcome.result.isErr()).toBe(true);
  });

  it('returns Err when minSample not met', () => {
    const listings = [makeListing({ zoneId: 'z1', price: 100 })];
    const rule = makeRule({
      target: { type: 'zone', zoneIds: ['z1'] },
      minSample: 3,
    });
    const outcome = evaluateRule(rule, listings, ccy('USD'), [id('s1')], NOW);
    expect(outcome.result.isErr()).toBe(true);
    expect(outcome.result.unwrapErr().type).toBe('InsufficientSampleError');
    expect(
      (outcome.result.unwrapErr() as import('../index.js').InsufficientSampleError).actual,
    ).toBe(1);
    expect(
      (outcome.result.unwrapErr() as import('../index.js').InsufficientSampleError).required,
    ).toBe(3);
  });

  it('respects maxAgeDays – stale listings are excluded', () => {
    const staleListings = [
      makeListing({ zoneId: 'z1', price: 50, listedAt: STALE }),
      makeListing({ zoneId: 'z1', price: 60, listedAt: STALE }),
    ];
    const rule = makeRule({
      target: { type: 'zone', zoneIds: ['z1'] },
      maxAgeDays: 7,
    });
    const outcome = evaluateRule(rule, staleListings, ccy('USD'), [id('s1')], NOW);
    expect(outcome.result.isErr()).toBe(true);
    expect(outcome.result.unwrapErr().type).toBe('NoComparablesError');
  });

  it('filters out non-USD listings when criteria currency is USD', () => {
    const listings = [makeListing({ zoneId: 'z1', price: 100, currency: 'EUR' })];
    const rule = makeRule({ target: { type: 'zone', zoneIds: ['z1'] } });
    const outcome = evaluateRule(rule, listings, ccy('USD'), [id('s1')], NOW);
    expect(outcome.result.isErr()).toBe(true);
  });
});

describe('recommendForSeat', () => {
  it('picks the first successful rule and returns Some recommendedPrice', () => {
    const listings = [
      makeListing({ seatId: 'seat-A', zoneId: 'z1', price: 120 }),
      makeListing({ seatId: 'seat-B', zoneId: 'z2', price: 200 }),
    ];
    const ruleNoMatch = makeRule({ id: 'r1', target: { type: 'zone', zoneIds: ['z99'] } });
    const ruleMatch = makeRule({
      id: 'r2',
      target: { type: 'zone', zoneIds: ['z1'] },
      increment: 5,
    });

    const rec = recommendForSeat(
      listings[0]!,
      [ruleNoMatch, ruleMatch],
      listings,
      ccy('USD'),
      [id('s1')],
      NOW,
    );
    expect(rec.recommendedPrice.isSome()).toBe(true);
    expect(rec.recommendedPrice.unwrap().price).toBe(125); // 120 + 5
    expect(rec.outcomes).toHaveLength(2);
    expect(rec.outcomes[0]!.result.isErr()).toBe(true);
    expect(rec.outcomes[1]!.result.isOk()).toBe(true);
    expect(rec.outcomes[1]!.result.unwrap().price).toBe(125);
  });

  it('returns None recommendedPrice when all rules fail', () => {
    const listings = [makeListing({ zoneId: 'z99' })];
    const ruleNoMatch = makeRule({ target: { type: 'zone', zoneIds: ['z1'] } });
    const rec = recommendForSeat(
      listings[0]!,
      [ruleNoMatch],
      listings,
      ccy('USD'),
      [id('s1')],
      NOW,
    );
    expect(rec.recommendedPrice.isNone()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Integration – runPricingEngine
// ---------------------------------------------------------------------------

describe('runPricingEngine – happy path', () => {
  it('returns Ok with a report containing every seat', () => {
    const listings = [
      makeListing({ seatId: 'A', zoneId: 'z1', price: 100 }),
      makeListing({ seatId: 'B', zoneId: 'z1', price: 200 }),
    ];
    const snapshot = makeMarket(listings);
    const criteria = makeCriteria([
      makeRule({ target: { type: 'zone', zoneIds: ['z1'] }, increment: 0 }),
    ]);
    const engineResult = runPricingEngine(snapshot, criteria, NOW);

    expect(engineResult.isOk()).toBe(true);
    const report = engineResult.unwrap();
    expect(report.criteriaId).toBe('c1');
    expect(report.eventId).toBe('evt-1');
    expect(report.seats).toHaveLength(2);
    // median(100, 200) = 150; both seats get 150
    expect(
      report.seats.every(
        (s) => s.recommendedPrice.isSome() && s.recommendedPrice.unwrap().price === 150,
      ),
    ).toBe(true);
  });

  it('stamps evaluatedAt with the injected nowMs', () => {
    const snapshot = makeMarket([makeListing()]);
    const report = runPricingEngine(snapshot, makeCriteria(), NOW).unwrap();
    expect(report.evaluatedAt).toBe('2026-02-27T12:00:00.000Z');
  });

  it('applies floor and ceiling in the report', () => {
    const listings = [makeListing({ zoneId: 'z1', price: 100 })];
    const snapshot = makeMarket(listings);
    const criteria = makeCriteria([
      makeRule({ target: { type: 'zone', zoneIds: ['z1'] }, increment: -90, floor: 20 }),
    ]);
    const report = runPricingEngine(snapshot, criteria, NOW).unwrap();
    // median=100, increment=-90 → 10, floor=20 → 20
    expect(report.seats[0]!.recommendedPrice.unwrap().price).toBe(20);
  });
});

describe('runPricingEngine – currency mismatch', () => {
  it('returns Err when event currency ≠ criteria currency', () => {
    const snapshot: MarketSnapshot = {
      ...makeMarket([]),
      event: { ...makeMarket([]).event, currency: ccy('EUR') },
    };
    const result = runPricingEngine(snapshot, makeCriteria(), NOW);
    expect(result.isErr()).toBe(true);
    expect(result.unwrapErr().type).toBe('CurrencyMismatchError');
    expect((result.unwrapErr() as import('../index.js').CurrencyMismatchError).eventCurrency).toBe(
      'EUR',
    );
    expect(
      (result.unwrapErr() as import('../index.js').CurrencyMismatchError).criteriaCurrency,
    ).toBe('USD');
  });
});

// ---------------------------------------------------------------------------
// 6. Edge cases
// ---------------------------------------------------------------------------

describe('edge case – empty snapshot', () => {
  it('returns Ok with empty seats array for a snapshot with no listings', () => {
    const result = runPricingEngine(makeMarket([]), makeCriteria(), NOW);
    expect(result.isOk()).toBe(true);
    expect(result.unwrap().seats).toHaveLength(0);
  });
});

describe('edge case – non-finite prices', () => {
  it('ignores NaN, +Inf, -Inf rows, still prices from valid rows', () => {
    const listings = [
      makeListing({ seatId: 'bad-1', zoneId: 'z1', price: NaN }),
      makeListing({ seatId: 'bad-2', zoneId: 'z1', price: Infinity }),
      makeListing({ seatId: 'good', zoneId: 'z1', price: 80 }),
    ];
    const criteria = makeCriteria([
      makeRule({ target: { type: 'zone', zoneIds: ['z1'] }, increment: 0 }),
    ]);
    const report = runPricingEngine(makeMarket(listings), criteria, NOW).unwrap();
    // All seats share the same comparable pool; only 'good' is valid → median = 80
    expect(
      report.seats.every(
        (s) => s.recommendedPrice.isSome() && s.recommendedPrice.unwrap().price === 80,
      ),
    ).toBe(true);
  });
});

describe('edge case – mixed currency in listing pool', () => {
  it('only uses USD listings as comparables when criteria currency is USD', () => {
    const listings = [
      makeListing({ seatId: 'a', zoneId: 'z1', price: 500, currency: 'EUR' }),
      makeListing({ seatId: 'b', zoneId: 'z1', price: 100, currency: 'USD' }),
    ];
    const criteria = makeCriteria([
      makeRule({ target: { type: 'zone', zoneIds: ['z1'] }, increment: 0 }),
    ]);
    const report = runPricingEngine(makeMarket(listings), criteria, NOW).unwrap();
    // Only the $100 USD listing is used → recommended price = 100
    expect(
      report.seats.every(
        (s) => s.recommendedPrice.isSome() && s.recommendedPrice.unwrap().price === 100,
      ),
    ).toBe(true);
  });
});

describe('edge case – negative increment pushes below zero', () => {
  it('without a floor the price can go negative', () => {
    const criteria = makeCriteria([
      makeRule({ target: { type: 'zone', zoneIds: ['z1'] }, increment: -50 }),
    ]);
    const report = runPricingEngine(
      makeMarket([makeListing({ zoneId: 'z1', price: 10 })]),
      criteria,
      NOW,
    ).unwrap();
    expect(report.seats[0]!.recommendedPrice.unwrap().price).toBe(-40);
  });

  it('with a floor of 0 the price is clamped', () => {
    const criteria = makeCriteria([
      makeRule({ target: { type: 'zone', zoneIds: ['z1'] }, increment: -50, floor: 0 }),
    ]);
    const report = runPricingEngine(
      makeMarket([makeListing({ zoneId: 'z1', price: 10 })]),
      criteria,
      NOW,
    ).unwrap();
    expect(report.seats[0]!.recommendedPrice.unwrap().price).toBe(0);
  });
});

describe('edge case – multiple rules, partial failures', () => {
  it('falls through to second rule when first has empty sample', () => {
    const listings = [makeListing({ zoneId: 'z2', price: 300 })];
    const primary = makeRule({
      id: 'primary',
      label: 'Primary – no listings',
      target: { type: 'zone', zoneIds: ['z1'] },
      increment: 0,
    });
    const fallback = makeRule({
      id: 'fallback',
      label: 'Fallback zone',
      target: { type: 'zone', zoneIds: ['z2'] },
      increment: -10,
    });
    const report = runPricingEngine(
      makeMarket(listings),
      makeCriteria([primary, fallback]),
      NOW,
    ).unwrap();
    expect(report.seats[0]!.recommendedPrice.unwrap().price).toBe(290); // 300 - 10
    expect(report.seats[0]!.outcomes[0]!.result.isErr()).toBe(true);
    expect(report.seats[0]!.outcomes[1]!.result.unwrap().price).toBe(290);
  });
});

describe('edge case – all rules fail', () => {
  it('recommendedPrice is None for a seat with no applicable rules', () => {
    const deadRule = makeRule({ target: { type: 'zone', zoneIds: ['zzz'] } });
    const report = runPricingEngine(
      makeMarket([makeListing({ zoneId: 'z1' })]),
      makeCriteria([deadRule]),
      NOW,
    ).unwrap();
    expect(report.seats[0]!.recommendedPrice.isNone()).toBe(true);
  });
});

describe('edge case – stale listings + fresh fallback', () => {
  it('stale rule fails; fresh rule succeeds', () => {
    const listings = [
      makeListing({ zoneId: 'z1', price: 200, listedAt: STALE }),
      makeListing({ zoneId: 'z1', price: 100, listedAt: RECENT }),
    ];
    const freshOnly = makeRule({
      id: 'fresh',
      target: { type: 'zone', zoneIds: ['z1'] },
      maxAgeDays: 7,
      increment: 0,
    });
    const report = runPricingEngine(makeMarket(listings), makeCriteria([freshOnly]), NOW).unwrap();
    // Only the RECENT listing (price=100) survives the age filter
    expect(report.seats[0]!.recommendedPrice.unwrap().price).toBe(100);
  });
});

describe('edge case – section scope', () => {
  it('prices using only listings from specified sections', () => {
    const listings = [
      makeListing({ seatId: 'a', sectionId: 'sA', price: 50 }),
      makeListing({ seatId: 'b', sectionId: 'sB', price: 150 }),
    ];
    const criteria = makeCriteria([
      makeRule({ target: { type: 'section', sectionIds: ['sA'] }, increment: 0 }),
    ]);
    const report = runPricingEngine(makeMarket(listings), criteria, NOW).unwrap();
    expect(
      report.seats.every(
        (s) => s.recommendedPrice.isSome() && s.recommendedPrice.unwrap().price === 50,
      ),
    ).toBe(true);
  });
});
