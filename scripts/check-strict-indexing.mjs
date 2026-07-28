// noUncheckedIndexedAccess ratchet.
//
// The flag surfaces ~750 errors across the codebase, which is a migration,
// not a config change. Turning it on globally would either block CI for
// weeks or rot in a branch. Instead: tsc runs with the flag over the whole
// program, and this script fails CI only for errors inside directories that
// have already been cleaned. Clean a directory, add it to CLEAN_DIRS, and
// the flag is enforced there forever after.
//
// A plain per-directory tsconfig include can't do this: tsc reports errors
// for every file in the program, transitive imports included, so the dirty
// core would leak into any include-based slice.
//
// Remaining dirty (by error count at adoption): state 155, tools 115,
// export 102, rendering 100, import 74, prefab 65, components 61,
// loaders 37, __tests__ 22, App.tsx 3.
import { spawnSync } from 'node:child_process';

const CLEAN_DIRS = ['src/algorithms/', 'src/settings/', 'src/validation/', 'src/hooks/'];

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsc', '--noEmit', '--noUncheckedIndexedAccess', '--pretty', 'false'],
  { encoding: 'utf8', shell: process.platform === 'win32' },
);

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const offending = output
  .split('\n')
  .filter((line) => /error TS\d+/.test(line))
  .map((line) => line.replace(/\\/g, '/'))
  .filter((line) => CLEAN_DIRS.some((dir) => line.startsWith(dir)));

if (offending.length > 0) {
  console.error(`noUncheckedIndexedAccess violations in ratcheted directories (${CLEAN_DIRS.join(', ')}):\n`);
  for (const line of offending) console.error('  ' + line);
  console.error('\nThese directories are index-access clean; keep them that way (or discuss un-ratcheting).');
  process.exit(1);
}

console.log(`noUncheckedIndexedAccess ratchet clean (${CLEAN_DIRS.length} dirs enforced).`);
