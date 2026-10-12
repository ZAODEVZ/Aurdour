// Offline check of DJ MixZ's set planning.   node web/dj/DjMixz.test.mjs
import { planSet, planTransition, energyOf, MOODS } from './DjMixz.js';
import { HarmonicMixer } from './HarmonicMixer.js';

const h = new HarmonicMixer();
let fail = 0;
const ok = (name, cond) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + name); if (!cond) fail += 1; };

// A 14-track playlist across tempos, keys and genres
const T = (id, bpm, key, genre, artist = 'A' + (id % 5)) => ({ id, title: 'T' + id, artist, bpm, key, genre, streamUrl: 'x' });
const pool = [
    T(1, 92, 'A minor', 'Lo-Fi'), T(2, 98, 'E minor', 'R&B'), T(3, 104, 'A minor', 'Hip-Hop'), T(4, 110, 'C major', 'Pop'),
    T(5, 118, 'G major', 'Disco'), T(6, 122, 'E minor', 'House'), T(7, 124, 'B minor', 'House'), T(8, 126, 'D major', 'Tech House'),
    T(9, 128, 'A major', 'Techno'), T(10, 130, 'F# minor', 'Techno'), T(11, 140, 'F minor', 'Dubstep'), T(12, 172, 'A minor', 'Drum & Bass'),
    T(13, 100, 'F major', 'Tribe Bass'), T(14, 81, 'C# major', 'Hip-Hop'),
];
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const thirds = (plan) => { const n = Math.floor(plan.length / 3); return [avg(plan.slice(0, n).map((p) => p.energy)), avg(plan.slice(n, 2 * n).map((p) => p.energy)), avg(plan.slice(-n).map((p) => p.energy))]; };

ok('energy: drum and bass hits harder than lo-fi; half-time hip-hop is not read as slow', energyOf(pool[11]) > 0.8 && energyOf(pool[0]) < 0.4 && energyOf(pool[13]) > 0.5);

const warm = planSet(pool, 'warmup', h);
const [w1, , w3] = thirds(warm);
ok('warm up: every track once, energy rises from the first third to the last', warm.length === 14 && new Set(warm.map((p) => p.track.id)).size === 14 && w3 > w1 + 0.1);

const sun = planSet(pool, 'sunset', h);
const [s1, , s3] = thirds(sun);
ok('sunset: energy falls', s1 > s3 + 0.1);

const jour = planSet(pool, 'journey', h);
const peakAt = jour.map((p) => p.energy).indexOf(Math.max(...jour.map((p) => p.energy))) / (jour.length - 1);
ok('journey: the peak lands in the back half, not at the very end', peakAt > 0.45 && peakAt < 0.98 && jour[jour.length - 1].energy < Math.max(...jour.map((p) => p.energy)));

ok('set length: maxTracks trims the set', planSet(pool, 'peak', h, { maxTracks: 6 }).length === 6);
ok('first track has no move in; every other track does', warm[0].move === null && warm.slice(1).every((p) => p.move && p.move.seconds > 0 && p.move.why));

const blend = planTransition(T(20, 124, 'A minor', 'House'), T(21, 125, 'E minor', 'House'), h);
ok('keys fit and tempo close: a long blend, in bars', blend.type === 'blend' && blend.bars >= 16 && Math.abs(blend.seconds - (blend.bars * 4 * 60) / 124) < 0.2);
const clashHi = planTransition(T(22, 128, 'A minor', 'Techno'), T(23, 128, 'F# major', 'Techno'), h);
const clashLo = planTransition(T(24, 96, 'A minor', 'Lo-Fi'), T(25, 96, 'F# major', 'Lo-Fi'), h);
ok('keys clash: a cut when the energy is high, an echo out when it is low', clashHi.type === 'cut' && clashLo.type === 'echo-out');
ok('tempo gap of 5 to 8 percent: filter sweep', planTransition(T(26, 120, 'A minor', 'House'), T(27, 128, 'A minor', 'House'), h).type === 'filter-sweep');
ok('never the same move three times running', planTransition(T(28, 124, 'A minor', 'House'), T(29, 124, 'A minor', 'House'), h, ['blend', 'blend']).type !== 'blend');
const runs = warm.slice(1).map((p) => p.move.type);
ok('a planned set never has three identical moves in a row', !runs.some((t, i) => i >= 2 && runs[i - 1] === t && runs[i - 2] === t));
ok('duplicates in the playlist are played once', planSet([...pool, ...pool], 'party', h).length === 14);
ok('five moods', MOODS.length === 5);

console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
