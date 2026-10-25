// HOOK HOP: songSections finds the first hook and the end of verse 1 from a song's loudness.
import { songSections } from './FlowMode.js';

let passed = 0, failed = 0;
const check = (name, cond) => { if (cond) { passed++; console.log('  ok  ', name); } else { failed++; console.log('  FAIL', name); } };
console.log('HookHop');

// One value a second. 120 bpm: a phrase (8 bars) is 16 s.
const song = (parts) => Float32Array.from(parts.flatMap(([secs, level]) => Array(secs).fill(level)));

// intro 8 s quiet, hook 16 s loud, verse 32 s, hook 16 s, verse 32 s, hook 16 s, outro 10 s
const a = songSections(song([[8, 0.05], [16, 0.9], [32, 0.5], [16, 0.9], [32, 0.5], [16, 0.9], [10, 0.1]]), 120, 130);
check('a song that opens on its hook: the hook is where the intro ends', a && a.hook === 8);
check('verse 1 ends where the second hook starts', a && a.verseEnd === 56);

// verse first: intro 4 s, verse 32 s, hook 16 s, verse 32 s, hook 16 s, outro 8 s
const b = songSections(song([[4, 0.05], [32, 0.5], [16, 0.95], [32, 0.5], [16, 0.95], [8, 0.1]]), 120, 108);
check('a verse-first song: the hook is the first loud phrase', b && b.hook === 36);
check('and verse 1 after it ends at the next hook', b && b.verseEnd === 84);

check('a flat song has no hook to hop to', songSections(song([[120, 0.5]]), 120, 120) === null);
check('a song too short to read gives nothing', songSections(song([[20, 0.5]]), 120, 20) === null);

// a hook with no second hook: verse 1 is two phrases at most from the end of the hook
const c = songSections(song([[4, 0.05], [16, 0.9], [80, 0.5]]), 120, 100);
check('no second hook: verse 1 still ends, two phrases after the hook', c && c.hook === 4 && c.verseEnd === 52);

// a fast song: phrases are shorter
const d = songSections(song([[6, 0.05], [12, 0.9], [24, 0.5], [12, 0.9], [24, 0.5], [12, 0.9], [6, 0.1]]), 160, 96);
check('at 160 bpm a phrase is 12 s', d && d.hook === 6 && d.verseEnd === 42);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
