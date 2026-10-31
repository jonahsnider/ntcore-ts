// @vitest-environment node
import { test } from 'vitest';
import { StructRegistry } from 'wpilib-struct';

import { getBuiltInDescriptor, getBuiltInSchemaString } from './built-in-schemas';
import { pack, unpack, type StructPlainObject } from './struct-codec';

test('Decode an array of 32 Pose2ds (768 bytes)', async ({ bench, expect }) => {
  const descriptor = getBuiltInDescriptor('Pose2d');
  if (!descriptor) throw new Error('Missing Pose2d descriptor');

  const registry = new StructRegistry();
  for (const name of ['Translation2d', 'Rotation2d', 'Pose2d']) {
    const schema = getBuiltInSchemaString(name);
    if (schema === undefined) throw new Error(`Missing schema for ${name}`);
    registry.register(name, schema);
  }

  const poses = Array.from({ length: 32 }, (_, i) => ({
    translation: { x: i / 4, y: -i / 8 },
    rotation: { value: (i - 16) / 32 },
  }));
  const payload = new Uint8Array(poses.length * descriptor.size);
  for (let i = 0; i < poses.length; i++) payload.set(pack(poses[i], descriptor), i * descriptor.size);
  expect(payload.byteLength).toBe(768);

  // Match NetworkTablesStructTopic's array loop, capturing imports outside timing.
  const unpackPose = unpack;
  const decodeNT4 = () => {
    const result: StructPlainObject[] = [];
    for (let offset = 0; offset < payload.byteLength; offset += descriptor.size) {
      result.push(unpackPose(new Uint8Array(payload.buffer, payload.byteOffset + offset, descriptor.size), descriptor));
    }
    return result;
  };
  const decodePackage = () => registry.decodeArray('Pose2d', payload);

  // Check every pose and warm the package decoder before measuring steady-state decoding.
  expect(decodeNT4()).toStrictEqual(poses);
  expect(decodePackage()).toStrictEqual(poses);

  let decoded: unknown;
  await bench.compare(
    bench('NT4 codec (32 x unpack)', () => {
      decoded = decodeNT4();
    }),
    bench('wpilib-struct decodeArray', () => {
      decoded = decodePackage();
    }),
    { time: 1_000, warmupTime: 500 }
  );
  expect(decoded).toStrictEqual(poses);
});
