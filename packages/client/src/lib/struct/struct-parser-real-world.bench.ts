// @vitest-environment node
import { test } from 'vitest';
import { parseStruct } from 'wpilib-struct';

import corpus from '../../../tests/bench-fixtures/wpilib-tbd-struct-schemas.json';
import { parseSchema as parseLegacySchema } from '../../../tests/bench-fixtures/legacy-struct-parser';
import { parseSchema } from './struct-parser';

const schemas = corpus.schemas.map(({ schema }) => schema);

test(`Real-world log: parse all ${schemas.length} struct schemas once`, async ({ bench, expect }) => {
  // Capture imports and prepare inputs outside timing, including Vitest module export getters.
  const previousParser = parseLegacySchema;
  const packageParser = parseStruct;
  const currentParser = parseSchema;
  const expected = schemas.map(previousParser);
  expect(schemas.length).toBeGreaterThan(0);
  expect(schemas.map(currentParser)).toStrictEqual(expected);
  expect(schemas.map(packageParser).map((fields) => fields.length)).toEqual(expected.map((fields) => fields.length));

  // Each sample parses the complete extracted corpus once, retaining every result.
  let parsed: unknown[][] = [];
  await bench.compare(
    bench('previous NT4 parser', () => {
      parsed = schemas.map(previousParser);
    }),
    bench('wpilib-struct (raw parser)', () => {
      parsed = schemas.map(packageParser);
    }),
    bench('wpilib-struct (NT4 adapter)', () => {
      parsed = schemas.map(currentParser);
    }),
    { time: 1_000, warmupTime: 500 }
  );
  expect(parsed.map((fields) => fields.length)).toEqual(expected.map((fields) => fields.length));
});
