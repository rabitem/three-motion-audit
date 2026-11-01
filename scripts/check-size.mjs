// Fails when the packed tarball grows past the budget: a guard against shipping tests, maps of
// dependencies or a stray build artefact. Run after `npm run build`.
import { execFileSync } from 'node:child_process';

const MAX_PACKED_BYTES = 80_000;

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const [pack] = JSON.parse(execFileSync(npm, ['pack', '--dry-run', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' }));
const packed = pack.size;
console.log(`${pack.filename}: ${pack.entryCount} files, ${packed} bytes packed, ${pack.unpackedSize} bytes unpacked (budget ${MAX_PACKED_BYTES} packed)`);
if (packed > MAX_PACKED_BYTES) {
  console.error(`The package is over its size budget by ${packed - MAX_PACKED_BYTES} bytes.`);
  process.exit(1);
}
