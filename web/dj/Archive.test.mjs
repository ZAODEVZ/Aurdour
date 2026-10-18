// node web/dj/Archive.test.mjs
import { readFileSync } from 'node:fs';
import { ARCHIVED, archiveCss, showAll } from './Archive.js';

let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };

console.log('Archive');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ids = ARCHIVED.map((a) => a.sel).filter((s) => s.startsWith('#') && s !== '#switch-pad').map((s) => s.slice(1));
check('every archived id is a real element on the page', ids.every((id) => html.includes(`id="${id}"`)));
check('every archived library tab is a real tab', ['liked', 'playlists', 'soundcloud', 'spotify'].every((t) => html.includes(`data-tab="${t}"`)));
check('the essentials are never archived', !ARCHIVED.some((a) => /library-open|remote-open|feedback-btn|djmixz|pro-mode-toggle|deck-a-play|deck-b-play|crossfader|share-mix|rec-btn/.test(a.sel)));
check('one CSS rule hides them all', archiveCss().split(',').length === ARCHIVED.length && archiveCss().includes('display: none !important'));
check('?all=1 shows everything again', showAll('?all=1') && showAll('?x=2&all=1') && !showAll('') && !showAll('?all=10'));
const md = readFileSync(new URL('../../ARCHIVE.md', import.meta.url), 'utf8');
check('ARCHIVE.md names every archived thing', ARCHIVED.every((a) => md.includes(a.what.split(' ')[0])));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
