# WPILib struct parsing and decoding demo

Run from the repository root after `npm ci`:

```sh
npx turbo run bench --filter=@ntcore-ts/client -- struct
```

The benchmark uses Vitest's `bench.compare()` API with a Node environment. Each synthetic schema-parsing sample parses the same schema 100 times. Vitest's throughput for those cases is **batches/second**, not schemas/second; multiply throughput by 100 (or divide mean latency by 100) for per-schema numbers. Relative speed ratios are unchanged.

The schema benchmarks compare three entries:

- **previous NT4 parser**: a benchmark-only copy from commit `fabac4afec9f4642340255929a594a3bdb743c6e`, before the package migration. The source is preserved in `packages/client/tests/bench-fixtures/legacy-struct-parser.ts`.
- **wpilib-struct (raw parser)**: `parseStruct()` from the installed npm package, including its schema validation.
- **wpilib-struct (NT4 adapter)**: the current NT4 `parseSchema()` implementation, including field conversion and enum conversion. This is the comparison that represents the actual NT4 migration.

Schemas cover WPILib geometry, nested type references, enums, bitfields, arrays, and a generated 64-field schema. The benchmark checks that the previous parser and current NT4 adapter produce equivalent output before measuring them. Each entry gets 500 ms of warmup and at least 1 second of measurement per schema.

The schema benchmarks cover uncached schema parsing only. They do not measure schema dependency resolution, binary decoding, networking, or end-to-end robot latency. The raw parser and NT4 adapter return different field representations, so both are shown separately. Neither uses the package's cached `parseStructSpecification()` helper.

Results depend on the CPU, runtime, power mode, and competing workloads. Share the command, Node and package versions, and machine details alongside the measured results; a faster schema parser does not imply an equal speedup for the entire NT4 client.

## Real-world WPILOG corpus

The additional `struct-parser-real-world.bench.ts` benchmark parses every struct schema extracted from [WPILIB_TBD_aba74b981a582b4b.wpilog](https://github.com/jonahsnider/wpilog-parser/blob/24a628dfa79175300bacd5267048e98c2b76be92/packages/wpilog-parser/tests/fixtures/logs/WPILIB_TBD_aba74b981a582b4b.wpilog). The log contains four schema records defining three unique structs: `ControlWord`, `SwerveModuleVelocity`, and `Rotation2d` (9 fields in total). `ControlWord` includes an enum, 64-bit bitfields, and boolean bitfields; `SwerveModuleVelocity` references `Rotation2d`.

Each timed sample parses **all three schemas once**, retaining all results. Its latency is the time to parse the complete set, and its throughput is **complete sets/second**. File reading, log decoding, extraction, fixture loading, and correctness checks are outside timing. This measures repeated uncached parsing with a warmed JavaScript engine, rather than a cold process startup.

Run only this case:

```sh
npx turbo run bench --filter=@ntcore-ts/client -- struct-parser-real-world
```

On the same machine and runtime listed below, one local run measured:

| Implementation      | Complete sets/second | Mean time for all three schemas | Relative throughput |
| ------------------- | -------------------: | ------------------------------: | ------------------: |
| Previous NT4 parser |           203,193.57 |                         ≈5.0 µs |               1.00× |
| Raw wpilib-struct   |           415,360.59 |                         ≈2.5 µs |               2.04× |
| NT4 adapter         |           359,547.52 |                         ≈2.8 µs |               1.77× |

Mean times are rounded from Vitest's output; ratios use its throughput measurements.

The extracted schemas are checked into `packages/client/tests/bench-fixtures/wpilib-tbd-struct-schemas.json`. They retain their original text and log order. Identical repeated definitions are deduplicated by type name and schema text. This removes the duplicate `ControlWord` definition logged under both `/.schema/` and `/NT:/.schema/`. The fixture records the source repository, revision, path, and log SHA-256. Running the benchmark requires only this repository and its normal npm dependencies.

To reproduce extraction, build a sibling `wpilog-parser` checkout at the source revision above (`pnpm install --frozen-lockfile`, then `pnpm run build`). From this repository, run:

```sh
node benchmarks/extract-wpilog-structs.mjs ../wpilog-parser
```

## Array of 32 Pose2ds

`struct-pose2d-array.bench.ts` compares decoding a generated array of **32 Pose2ds (768 bytes)** into plain objects:

- **NT4 codec (32 x unpack)** uses the array loop from `NetworkTablesStructTopic`: each pose is a view into the shared payload decoded with the existing `unpack()` codec.
- **wpilib-struct decodeArray** uses `StructRegistry.decodeArray('Pose2d', payload)` with the default decoder policy, which uses runtime compilation in this Node environment.

Each sample decodes the complete array once and retains all 32 decoded values. Schemas, descriptors, payload generation, initial decoder compilation, and correctness checks are outside timing. Both implementations must return the same generated poses before the comparison runs, and the final timed result is checked too.

This is a steady-state **binary decoding** comparison. The NT4 migration currently replaces schema parsing; NT4 still uses its existing binary codec. These decoding results therefore describe a separate potential integration, rather than a speedup already delivered by the schema parser change.

Run only this case:

```sh
npx turbo run bench --filter=@ntcore-ts/client -- struct-pose2d-array
```

On the same machine and runtime listed below, one local run measured:

| Implementation            | Complete arrays/second | Mean time for all 32 poses | Relative throughput |
| ------------------------- | ---------------------: | -------------------------: | ------------------: |
| NT4 codec (32 x unpack)   |             119,707.15 |                    ≈8.6 µs |               1.00× |
| wpilib-struct decodeArray |           3,148,917.19 |                    ≈0.4 µs |              26.31× |

Mean times are rounded from Vitest's output; ratios use its throughput measurements. These results exclude initial decoder compilation and schema registration.

## Example schema parsing results

Measured on 2026-10-31 with an Apple M4 Pro, macOS arm64, Node v26.12.1, Vitest 5.0.5, and `wpilib-struct` 1.0.1, using `npx turbo run bench --filter=@ntcore-ts/client -- struct-parser`. No other checks were running during this measurement.

Throughput below is in **batches/second (100 parses per batch)**. Parentheses show throughput relative to the previous NT4 parser. These are observations from one local run, not performance guarantees.

| Schema        | Previous NT4 parser | Raw wpilib-struct |       NT4 adapter |
| ------------- | ------------------: | ----------------: | ----------------: |
| Rotation2d    |           54,723.74 | 88,291.21 (1.61×) | 83,115.38 (1.52×) |
| Translation2d |           18,583.97 | 46,827.72 (2.52×) | 43,707.77 (2.35×) |
| Pose2d        |           18,391.45 | 42,474.29 (2.31×) | 39,928.18 (2.17×) |
| Telemetry     |            1,888.71 |  4,340.89 (2.30×) |  3,792.28 (2.01×) |
| 64 fields     |              440.79 |  1,276.86 (2.90×) |  1,214.74 (2.76×) |
