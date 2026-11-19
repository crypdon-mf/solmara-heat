// Solmara Heat v2 — entry program for the make.fun gta6-01 bounty.
// Node 22, standard library only, no network. The game is plain static
// files under game/ next to this file, and the screenshots live in
// screenshots/. All this program does is hand both over: it copies them
// into the output directory and asks the vendored make.fun library to
// write dossier.json there — the summary the judge reads.
//
// Local check (mirrors the grader, minus the sandbox):
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Run it twice and diff the outputs: they must be byte-identical.
// Play the game locally with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Where the repo lives on disk, and where the bundle goes.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fresh output tree, then the two inputs, in a fixed order.
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The scorer's caps, passed through verbatim so this program refuses
// exactly where the scorer would: at most 4 screenshots of 256 KiB each,
// at most 993 files / 48 MiB under game/, and no game path over 1000 bytes.
// Of these, only text_max_bytes changes the dossier bytes; the rest are
// hard refusals. Nothing here depends on the clock or on randomness, so
// two runs write identical bytes.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
