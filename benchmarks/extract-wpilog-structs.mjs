import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Run after building the sibling wpilog-parser checkout. No dependency is needed to run the benchmark itself.
const checkout = resolve(process.argv[2] ?? '../wpilog-parser');
const logPath = 'packages/wpilog-parser/tests/fixtures/logs/WPILIB_TBD_aba74b981a582b4b.wpilog';
const { catalogEntries, readRecords } = await import(
  pathToFileURL(resolve(checkout, 'packages/wpilog-parser/dist/index.mjs')).href
);
const bytes = await readFile(resolve(checkout, logPath));
const entries = new Map(
  [...catalogEntries(readRecords(bytes))]
    .filter((entry) => entry.type === 'structschema')
    .map((entry) => [entry.entryId, entry.name])
);
const decoder = new TextDecoder();
const seen = new Set();
const schemas = [];
let schemaRecords = 0;

for (const record of readRecords(bytes)) {
  if (record.kind !== 'data') continue;
  const entryName = entries.get(record.record.entryId);
  if (entryName === undefined) continue;
  schemaRecords++;
  const name = entryName.slice(entryName.lastIndexOf('struct:') + 'struct:'.length);
  const schema = decoder.decode(record.record.payload);
  // Preserve log order and distinct definitions, deduplicating repeated identical announcements.
  const key = JSON.stringify([name, schema]);
  if (seen.has(key)) continue;
  seen.add(key);
  schemas.push({ name, schema });
}

if (schemas.length === 0) throw new Error('The log contains no struct schemas');

const fixture = {
  source: {
    repository: 'https://github.com/jonahsnider/wpilog-parser',
    revision: execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    path: logPath,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  },
  schemaRecords,
  schemas,
};
const destination = new URL('../packages/client/tests/bench-fixtures/wpilib-tbd-struct-schemas.json', import.meta.url);
await writeFile(destination, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`Extracted ${schemas.length} unique definitions from ${schemaRecords} schema records`);
