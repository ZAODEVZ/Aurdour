// /stream: what the display shows, from the desk state.
import { streamCard, isStreamView, chatChannel, chatLines, DEFAULT_CHAT, upNext, upNextHtml, QUEUE_MAX, pickState, MIRROR_TTL } from './StreamView.js';

let passed = 0, failed = 0;
const check = (name, cond) => { if (cond) { passed++; console.log('  ok  ', name); } else { failed++; console.log('  FAIL', name); } };
console.log('StreamView');

check('/stream is the stream view', isStreamView({ pathname: '/stream', search: '' }) && isStreamView({ pathname: '/stream/', search: '' }));
check('?view=stream is too, the desk is not', isStreamView({ pathname: '/', search: '?view=stream' }) && !isStreamView({ pathname: '/', search: '' }));

const state = { live_deck: 'B', live: true, A: { loaded: true, title: 'Old', artist: 'X', time: 200, dur: 210 }, B: { loaded: true, title: 'Wild Out', artist: 'IMan Afrikah', time: 60, dur: 240 }, mixz: { running: true, next: { title: 'Topier', artist: 'IMan Afrikah' } } };
const c = streamCard(state, 'https://x/art.jpg');
check('it shows the deck on air, not the other one', c.title === 'Wild Out' && c.artist === 'IMan Afrikah' && c.deck === 'B');
check('progress and time', Math.abs(c.progress - 0.25) < 1e-9 && c.time === '1:00 / 4:00');
check('up next from DJ MixZ', c.next === 'Topier · IMan Afrikah');
check('live flag and cover art', c.live === true && c.art === 'https://x/art.jpg');
check('nothing loaded: a holding card, not a blank', streamCard({ live_deck: null, mixz: {} }).title === 'ZAO MixZ');

// The desk tab mirrored onto an empty /stream tab (Zaal, 5 Nov: stream button with music playing)
const empty = { live_deck: null, mixz: {} };
const desk = { at: 1000, state, art: 'https://x/a.jpg' };
check('empty stream tab shows the desk tab', pickState(empty, desk, 2000).mirrored && streamCard(pickState(empty, desk, 2000).state).title === 'Wild Out' && pickState(empty, desk, 2000).art === 'https://x/a.jpg');
check('its own loaded deck wins over the desk tab', !pickState(state, { at: 1000, state: { live_deck: 'A', A: { loaded: true, title: 'Other' } } }, 2000).mirrored);
check('a desk tab that went quiet stops showing', !pickState(empty, desk, 1000 + MIRROR_TTL + 1).mirrored);
check('no desk tab: the holding card', streamCard(pickState(empty, null).state).artist === 'Back in a moment');
// Up next under the song: a request marked next, then DJ MixZ, then the other deck
const two = { live_deck: 'A', A: { loaded: true, playing: true, title: 'Now', dur: 100, time: 1 }, B: { loaded: true, playing: false, title: 'Cued', artist: 'IMan Afrikah' }, mixz: {} };
check('up next: the song waiting on the other deck', streamCard(two).next === 'Cued · IMan Afrikah');
check('up next: DJ MixZ pick beats the other deck', streamCard({ ...two, mixz: { running: true, next: { title: 'Pick' } } }).next === 'Pick');
check('up next: a request marked next beats both', streamCard({ ...two, mixz: { running: true, next: { title: 'Pick' } }, req: { up: [{ title: 'Asked', artist: 'Fan', status: 'next' }] } }).next === 'Asked · Fan');
check('up next: nothing waiting, nothing shown', streamCard({ ...two, B: { loaded: false } }).next === '');
// Twitch chat on the display
check('chat channel: the link wins, then the saved one, then Zaal\'s', chatChannel({ search: '?chat=ZAOfestivals' }, 'other') === 'zaofestivals' && chatChannel({ search: '' }, '#Saved_One') === 'saved_one' && chatChannel({ search: '' }, '') === DEFAULT_CHAT);
check('?chat= with nothing turns the chat off', chatChannel({ search: '?chat=' }, 'saved') === '');
check('odd characters never reach the IRC join', chatChannel({ search: '?chat=a b<c>' }, '') === 'abc');
let lines = [];
for (let i = 0; i < 12; i++) lines = chatLines(lines, { user: 'u' + i, text: 'hi' }, 1000 + i);
check('only the newest 8 lines stay', lines.length === 8 && lines[0].user === 'u4' && lines[7].user === 'u11');
check('old lines fade out after 90 s', chatLines(lines, null, 1011 + 90000).length === 0 && chatLines(lines, null, 1006 + 90000).length === 5);

// The request line on the display
{
    const board = { up: [
        { rid: 'r2', title: 'Rude Boy', artist: 'IMan Afrikah', name: 'Ana', note: 'for my mum', status: 'next' },
        ...Array.from({ length: 6 }, (_, i) => ({ rid: `r${i + 3}`, title: `Song ${i}`, artist: '', name: `U${i}`, status: 'waiting' })),
    ] };
    const rows = upNext(board);
    check(`up next keeps the board order, at most ${QUEUE_MAX}`, rows.length === QUEUE_MAX && rows[0].title === 'Rude Boy' && rows[0].next && rows[1].title === 'Song 0');
    check('song, artist and the caller\'s name only: no note', !JSON.stringify(rows).includes('mum') && rows[0].name === 'Ana' && rows[0].artist === 'IMan Afrikah');
    const html = upNextHtml(rows);
    check('it reads "requested by" the name', html.includes('requested by Ana') && html.includes('<b>Rude Boy</b>'));
    const evil = upNextHtml(upNext({ up: [{ title: '<img src=x onerror=alert(1)>', artist: '"><script>', name: '<b>x</b>', status: 'waiting' }] }));
    check('a title, artist or name never becomes markup', !evil.includes('<img') && !evil.includes('<script') && !evil.includes('<b>x</b>') && evil.includes('&lt;img'));
    check('nothing waiting: nothing to show', upNextHtml(upNext(null)) === '' && upNextHtml(upNext({ up: [] })) === '');
    check('no em dash in what the panel says', !html.includes(String.fromCharCode(0x2014)));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
