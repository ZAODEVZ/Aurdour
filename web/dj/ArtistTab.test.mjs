// node web/dj/ArtistTab.test.mjs
import { ARTIST_TABS, tracksFor } from './ArtistTab.js';

let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };

console.log('ArtistTab');
const jango = ARTIST_TABS.find((t) => t.id === 'jango');
const lib = [
    { title: 'NEIL', artist: 'Jango UU' },
    { title: 'Stay Solid', artist: 'DJANGO x RAAVI' },
    { title: 'East vol 1', artist: 'IMan Afrikah' },
    { title: 'No artist' },
];
check('the Jango page holds only Jango, however his name is written', tracksFor(lib, jango).map((t) => t.title).join() === 'NEIL,Stay Solid');
check('an empty library gives an empty page, not an error', tracksFor(undefined, jango).length === 0 && tracksFor([], jango).length === 0);
check('the empty page says why, in plain words', /did not load/.test(jango.waiting) && !/not in yet/.test(jango.waiting) && !/—/.test(jango.waiting + jango.loading));
const audius = [{ id: 'a1', title: 'NEIL', artist: 'Jango UU', source: 'audius' }, { id: 'a2', title: 'Two', artist: 'Jango UU', source: 'audius' }];
check('the Jango page lists his Audius songs first, then the library ones', tracksFor(lib, jango, audius).map((t) => t.id ?? t.title).join() === 'a1,a2,NEIL,Stay Solid');
check('a song in both lists shows once', tracksFor([audius[0]], jango, audius).length === 2);
check('the Jango page reads Audius from his pool', jango.pool === 'jangoTracks' && typeof jango.load === 'function');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
