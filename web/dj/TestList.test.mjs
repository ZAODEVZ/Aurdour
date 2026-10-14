// node web/dj/TestList.test.mjs
import { ITEMS, ROUND, report, issueUrl } from './TestList.js';

let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };

console.log('TestList');
check('the round has an id, a title and a date', /^\d{4}-\d{2}-\d{2}/.test(ROUND.id) && ROUND.title && ROUND.date);
check('every item has a group, a unique id and text', ITEMS.every((i) => i.g && i.id && i.t) && new Set(ITEMS.map((i) => i.id)).size === ITEMS.length);
check('the list covers the decks, the phone, the mix link, the controller and DJ MixZ', ['The decks', 'The phone', 'The mix link', 'The controller', 'DJ MixZ'].every((g) => ITEMS.some((i) => i.g === g)));

const state = { title: { ok: true }, listen: { ok: false, note: 'said PLAY ALONG, no sound for 20 s' }, share: { ok: true, note: ' ' } };
const text = report(ITEMS, state, { extra: 'battles from two phones next', device: 'iPhone, Safari' });
check('the report starts with the round and the device', text.startsWith(`MixZ test: ${ROUND.title} (${ROUND.date})\nOn: iPhone, Safari`));
check('an OK, a NO with its note, and an untried item read differently', text.includes('OK Titles read clean') && text.includes('NO LISTEN on mobile data') && text.includes('>> said PLAY ALONG, no sound for 20 s') && text.includes('-- ON AIR sits'));
check('a blank note is not printed', !/OK SHARE THE MIX copies a link[^\n]*>>/.test(text));
check('groups are headed', text.includes('\n\nTHE PHONE\n') && text.includes('\n\nTHE DECKS\n'));
check('the extra box lands under ALSO and the count closes it', text.includes('\n\nALSO\nbattles from two phones next') && text.endsWith(`2 ok, 1 not ok, ${ITEMS.length - 3} not tried`));
check('with nothing ticked the report still reads', report(ITEMS, {}).endsWith(`0 ok, 0 not ok, ${ITEMS.length} not tried`) && report(ITEMS, null).includes('-- '));
const url = issueUrl('bettercallzaal/ZAOMixZ', 'Test round: 1 not ok', text);
check('the GitHub link carries the title and the whole report', url.startsWith('https://github.com/bettercallzaal/ZAOMixZ/issues/new?title=Test%20round') && decodeURIComponent(url.split('&body=')[1]) === text);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
