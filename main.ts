// main.ts — Solmara Heat entry builder (make.fun gta6-01).
//
// What it does, in plain terms: it assembles the submission folder the
// grader reads. It copies the playable game (game/) and the screenshots
// (screenshots/) into the output directory, then asks the kit's
// buildDossier to write dossier.json from exactly what landed there.
// The dossier is deterministic: same files in, same bytes out, so the
// grader's two runs match.
//
// Run it with:  MAKEFUN_OUTPUT_DIR=out node main.ts
// (no env var: it writes to /output, the grader's default.)

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// Start from an empty folder so a stale file can never sneak into the
// dossier: remove it first, then rebuild it from scratch.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const folder of ['game', 'screenshots']) {
  const src = join(here, folder);
  if (!existsSync(src)) throw new Error(`missing ${folder}/ next to main.ts`);
  cpSync(src, join(outDir, folder), { recursive: true });
}

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`wrote ${join(outDir, 'dossier.json')} (${dossier.length} bytes)`);
