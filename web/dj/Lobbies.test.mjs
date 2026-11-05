// The standing lobbies, their links, and lobby requests.
//   node web/dj/Lobbies.test.mjs
import { LOBBIES, lobbyLabel, lobbyLinks, lobbyRequest } from './Lobbies.js';
import { validRoom } from './LiveMix.js';
import { streamRoom, isStreamView } from './StreamView.js';

let passed = 0, failed = 0;
const check = (name, cond) => { if (cond) { passed++; console.log('  ok  ', name); } else { failed++; console.log('  FAIL', name); } };
console.log('Lobbies');

check("Zaal's lobby and the guest lobby are listed, with valid lobby names", LOBBIES.map((l) => l.room).join() === 'zaal,guest' && LOBBIES.every((l) => validRoom(l.room)));
check('labels: known lobbies by name, others by their link name', lobbyLabel('zaal') === "Zaal's lobby" && lobbyLabel('guest') === 'Guest lobby' && lobbyLabel('main-stage') === 'Lobby main-stage');
const l = lobbyLinks('https://zaomixz.vercel.app/', 'zaal');
check('stream link is /stream/<lobby>, watch link is mix.html#lobby=<lobby>', l.stream === 'https://zaomixz.vercel.app/stream/zaal' && l.watch === 'https://zaomixz.vercel.app/mix.html#lobby=zaal');

check('/stream/zaal is the stream view and claims zaal', isStreamView({ pathname: '/stream/zaal', search: '' }) && streamRoom({ pathname: '/stream/zaal' }) === 'zaal' && streamRoom({ pathname: '/stream/zaal/' }) === 'zaal');
check('plain /stream claims nothing', streamRoom({ pathname: '/stream' }) === '' && streamRoom({ pathname: '/stream/' }) === '');
check('a messy name in the link becomes a lobby name', streamRoom({ pathname: '/stream/Main%20Stage' }) === 'main-stage');
check('a name with nothing usable claims nothing', streamRoom({ pathname: '/stream/%21%21' }) === '' && streamRoom({ pathname: '/stream/%E0%A4%A' }) === '');
check('deeper paths are not the stream view', !isStreamView({ pathname: '/stream/a/b', search: '' }) && streamRoom({ pathname: '/stream/a/b' }) === '');

const r = lobbyRequest({ lobby: 'Friday Vibes', who: 'DJ Afrikah', contact: '@imanafrikah', when: 'Fridays 8pm ET' });
check('a request carries the lobby, the DJ, when, and the contact', r.kind === 'Lobby request' && r.message === 'Lobby request: Friday Vibes\nDJ: DJ Afrikah\nWhen: Fridays 8pm ET' && r.contact === '@imanafrikah');
check('a request needs a lobby name and a DJ', lobbyRequest({ who: 'x y' }) === 'give the lobby a name' && lobbyRequest({ lobby: 'ok' }) === 'say who will DJ in it');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
