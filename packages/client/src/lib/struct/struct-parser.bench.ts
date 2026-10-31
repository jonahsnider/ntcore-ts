// @vitest-environment node
import { test } from 'vitest';
import { parseStruct } from 'wpilib-struct';

import { parseSchema as parseLegacySchema } from '../../../tests/bench-fixtures/legacy-struct-parser';
import { parseSchema } from './struct-parser';

const PARSES_PER_SAMPLE = 100;

const schemas = [
  { name: 'Rotation2d (1 field)', schema: 'double value' },
  { name: 'Translation2d (2 fields)', schema: 'double x;double y' },
  { name: 'Pose2d (2 nested type references)', schema: 'Translation2d translation;Rotation2d rotation' },
  {
    name: 'Telemetry (enums, bitfields, arrays)',
    schema:
      'enum { UNKNOWN=-1,IDLE=0,RUNNING=1,FAULT=2, } int32 state;uint16 flags:4;bool enabled:1;uint16 mode:3;double timestamp;double position[3];float velocities[4];int32 counts[8]',
  },
  {
    name: 'Large schema (64 fields)',
    schema: Array.from({ length: 64 }, (_, i) => `double channel${i}`).join(';'),
  },
];

for (const { name, schema } of schemas) {
  test(`${name}: ${PARSES_PER_SAMPLE} uncached parses per sample`, async ({ bench, expect }) => {
    // Capture imports outside timing to avoid Vitest module export getter overhead.
    const previousParser = parseLegacySchema;
    const packageParser = parseStruct;
    const currentParser = parseSchema;
    const expected = previousParser(schema);
    // Check the actual NT4 output before timing; validation is outside the hot loop.
    expect(currentParser(schema)).toStrictEqual(expected);
    expect(packageParser(schema)).toHaveLength(expected.length);

    // Keep the last result observable so the engine cannot discard the parsing work.
    let fields: unknown[] = [];
    await bench.compare(
      bench('previous NT4 parser', () => {
        for (let i = 0; i < PARSES_PER_SAMPLE; i++) fields = previousParser(schema);
      }),
      bench('wpilib-struct (raw parser)', () => {
        for (let i = 0; i < PARSES_PER_SAMPLE; i++) fields = packageParser(schema);
      }),
      bench('wpilib-struct (NT4 adapter)', () => {
        for (let i = 0; i < PARSES_PER_SAMPLE; i++) fields = currentParser(schema);
      }),
      { time: 1_000, warmupTime: 500 }
    );
    expect(fields).toHaveLength(expected.length);
  });
}
