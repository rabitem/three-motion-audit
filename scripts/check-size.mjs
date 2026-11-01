// Fails when the packed tarball grows past the budget: a guard against shipping tests, maps of
// dependencies or a stray build artefact. Run after `npm run build`.
import { execFileSync } from 'node:child_process';

const MAX_PACKED_BYTES = 80_000;

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const output = JSON.parse(execFileSync(npm, ['pack', '--dry-run', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' }));
// npm 10 and 11 print an array; npm 12 prints an object keyed by package name.
const [pack] = Array.isArray(output) ? output : Object.values(output);
const packed = pack.size;
console.log(`${pack.filename}: ${pack.entryCount} files, ${packed} bytes packed, ${pack.unpackedSize} bytes unpacked (budget ${MAX_PACKED_BYTES} packed)`);
if (packed > MAX_PACKED_BYTES) {
  console.error(`The package is over its size budget by ${packed - MAX_PACKED_BYTES} bytes.`);
  process.exit(1);
}
