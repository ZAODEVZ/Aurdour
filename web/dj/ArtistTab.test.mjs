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
check('the empty page says why, in plain words', /not in yet/.test(jango.waiting) && !/—/.test(jango.waiting));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
