// Offline check of the next-track picking rules.   node web/dj/SwitchPad.test.mjs
import { rankFor, keyRelation, SWITCH_MODES } from './SwitchPad.js';
import { HarmonicMixer } from './HarmonicMixer.js';

const h = new HarmonicMixer();
const cur = { id: 'c', title: 'Now', bpm: 124, key: 'A minor', genre: 'House' }; // 8A
const pool = [
    { id: 1, title: 'same key same bpm', bpm: 124, key: 'A minor', genre: 'House' },
    { id: 2, title: 'faster +1', bpm: 130, key: 'E minor', genre: 'House' },      // 9A, +4.8%
    { id: 3, title: 'slower -1', bpm: 118, key: 'D minor', genre: 'House' },      // 7A, -4.8%
    { id: 4, title: 'relative major', bpm: 125, key: 'C major', genre: 'Disco' }, // 8B
    { id: 5, title: 'clash', bpm: 124, key: 'F# major', genre: 'House' },         // 2B
    { id: 6, title: 'hiphop half', bpm: 62, key: 'A minor', genre: 'Hip-Hop' },
    { id: 7, title: 'far fast', bpm: 174, key: 'A minor', genre: 'Drum & Bass' },
    { id: 8, title: 'no data', genre: 'Ambient' },
    { id: 9, title: 'lift 2', bpm: 123, key: 'B minor', genre: 'Techno' },        // 10A
];

let fail = 0;
const ok = (name, cond) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + name); if (!cond) fail += 1; };
const top = (mode, exclude) => rankFor(mode, cur, pool, h, exclude).map((r) => r.track.id);

ok('key relations: lift, flip, clash, unknown',
    keyRelation(h, 'A minor', 'E minor') === 'up1' && keyRelation(h, 'A minor', 'C major') === 'flip'
    && keyRelation(h, 'A minor', 'F# major') === 'clash' && keyRelation(h, 'A minor', null) === 'unknown');
ok('same vibe: same key and tempo first; clash and far tempo left out', top('smooth')[0] === 1 && !top('smooth').includes(5) && !top('smooth').includes(7));
ok('energy up: the faster track, never a slower or equal one', top('up')[0] === 2 && !top('up').includes(3) && !top('up').includes(1));
ok('cool down: the slower track', top('down')[0] === 3 && !top('down').includes(2));
ok('key lift: a new key that fits, not the same key', top('key').includes(2) && top('key').includes(9) && !top('key').includes(1) && !top('key').includes(5));
ok('mood flip: the relative major only', top('mood').join() === '4');
ok('new genre: other genres only, the one that fits the key first', !top('genre').includes(1) && top('genre')[0] === 4);
ok('half / 2x: the half-time track', top('double').join() === '6');
ok('surprise: no clash, no far tempo', !top('wild').includes(5) && !top('wild').includes(7) && top('wild').length > 2);
ok('tracks already played are skipped', top('smooth', new Set(['1']))[0] !== 1);
ok('current track with no tempo or key: no crash', Array.isArray(rankFor('smooth', { id: 'x', title: 'bare' }, pool, h)));
ok('keys spelled out the Audius way are understood',
    h.getCamelot('E flat minor') === '2A' && h.getCamelot('F sharp major') === '2B' && h.getCamelot('C sharp minor') === '12A' && h.getCamelot('B flat major') === '6B');
const { applySheet } = await import('./ZaoCrate.js');
const ne = applySheet({ title: 'IMAN AFRIKAH - NORTH-EAST vol 1 (TRIBE-BASS)', bpm: 51, key: null });
const ea = applySheet({ title: 'IMAN AFRIKAH - EAST vol 1 (TRIBE-BASS)' });
const coc = applySheet({ title: 'C.O.C SONG', bpm: 107, key: 'B flat minor' });
ok('song sheet: the artist\'s tempo and key win, and North-East vol 1 is not read as East vol 1',
    ne.bpm === 102 && ne.key === 'F minor' && ea.bpm === 100 && ea.key === 'F major' && coc.bpm === 160.3 && coc.key === 'A# minor'
    && applySheet({ title: 'Some other song', bpm: 90 }).bpm === 90);
ok('sharp keys written long ("A# minor", "C# major") are understood', h.getCamelot('A# minor') === '3A' && h.getCamelot('C# major') === '3B' && h.getCamelot('Eb minor') === '2A');
ok('eight modes for eight pads', SWITCH_MODES.length === 8);

console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
