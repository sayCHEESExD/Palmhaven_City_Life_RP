/**
 * Sanity checks on the SUPPLIED assets.
 *
 * These are the only files in the project that were authored elsewhere, and
 * none of them may be modified: a silent change should produce a loud failure
 * here rather than a character that animates wrongly weeks later.
 *
 * Everything else the game draws is generated at runtime, which is why this
 * list is short and why it stays short.
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * Known-good digests of the supplied assets the game SHIPS: the bundled avatar
 * body (every citizen until their Bloxity avatar loads), the music the car
 * radio and the title screen play, the surf, and the few one-shot samples.
 * Everything else - every building, car, prop, icon and most sounds - is
 * generated at runtime.
 */
const EXPECTED = [
  { path: 'assets/player/player.fbx', md5: '4211d040bb7098791816ad92a0accaaa' },
  { path: 'assets/player/green.png', md5: '67421b6f13962ead111335ff50bf58fe' },
  { path: 'assets/audio/background.mp3', md5: '1f1d91a0649db55386b984c3b55422a3' },
  { path: 'assets/audio/sea.mp3', md5: '7b31c3703f90f36557f542f114d00c4a' },
  { path: 'assets/audio/jump.mp3', md5: '77c58db6921be7b0c7a61903d38bbf30' },
  { path: 'assets/audio/swim.mp3', md5: '22d7e02c3bdeee3f21676b605a4679e5' },
  { path: 'assets/audio/fall.mp3', md5: 'a6c361490b027a8effd0ac861936a5a7' },
  { path: 'assets/audio/punch.mp3', md5: 'e9313c750d883a1d549af459ad898f12' },
  { path: 'assets/audio/anime-shine.mp3', md5: '722473eb2ce6ed998d762fe03225358f' },
];

let failures = 0;

for (const asset of EXPECTED) {
  const full = new URL(asset.path, `file://${root.replace(/\\/g, '/')}`);
  let bytes;
  try {
    bytes = readFileSync(full);
  } catch {
    console.error(`  FAIL  ${asset.path} is missing`);
    failures += 1;
    continue;
  }
  const digest = createHash('md5').update(bytes).digest('hex');
  const size = statSync(full).size;
  if (digest !== asset.md5) {
    console.error(`  FAIL  ${asset.path} has changed (${digest})`);
    failures += 1;
  } else {
    console.log(`  ok    ${asset.path} (${size} bytes)`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} asset problem(s). The supplied files must never be modified.`);
  process.exit(1);
}
console.log('\nassets OK');
