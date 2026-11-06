// node web/dj/LiveStream.test.mjs — one link per stream: links, the card message, and /api/live.
import { createRequire } from 'module';
import crypto from 'crypto';
import { streamIdFrom, lobbyFrom, cardMessage, hearingMix, STREAM_ID } from './LiveStream.js';

const require = createRequire(import.meta.url);
const live = require('../../api/live.js');
let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };
console.log('LiveStream');

// Links
check('/stream/<8 digits> is a stream link', streamIdFrom('/stream/73822762') === '73822762' && streamIdFrom('/stream/73822762/') === '73822762');
check('/stream/zaal and /stream are not', streamIdFrom('/stream/zaal') === '' && streamIdFrom('/stream') === '' && streamIdFrom('/stream/123') === '');
check('/lobby/<name> names the lobby', lobbyFrom('/lobby/Zaal') === 'zaal' && lobbyFrom('/lobby/') === '' && lobbyFrom('/lobby/x') === '');
check('new ids are 8 digits and differ', [...Array(50)].map(live.newId).every((id) => STREAM_ID.test(id)) && new Set([...Array(50)].map(live.newId)).size > 45);
check('lobby names are cleaned', live.cleanLobby(' Zaal ') === 'zaal' && live.cleanLobby('<script>') === '' && live.cleanLobby('') === '');

// The card message stays small and safe
const m = cardMessage({ on: true, title: 'x'.repeat(200), artist: 'IMan', progress: 0.123456, time: '1:00 / 4:00', next: 'Topier', deck: 'B', art: 'javascript:alert(1)' });
check('card: title cut, progress rounded, deck kept', m.title.length === 80 && m.progress === 0.123 && m.deck === 'B' && m.t === 'card');
check('card: only https cover art passes', m.art === '' && cardMessage({ art: 'https://x/a.jpg' }).art === 'https://x/a.jpg');

// After connecting, a listener already hearing the mix stays LIVE
const T = { Kind: { Audio: 'audio' } };
const roomWith = (pubs) => ({ remoteParticipants: new Map([['host', { trackPublications: new Map(pubs.map((p, i) => [String(i), p])) }]]) });
check('mix already playing after connect: LIVE, not OFF AIR', hearingMix(roomWith([{ kind: 'audio', track: {} }]), T) === true);
check('host there but no sound yet: waiting', hearingMix(roomWith([{ kind: 'audio', track: null }]), T) === false && hearingMix({ remoteParticipants: new Map() }, T) === false);

// Tickets are real HS256 JWTs with the right grants
const tok = live.ticket('KEY', 'SECRET', { identity: 'listen-1', ttl: 60, video: { room: '73822762', roomJoin: true, canPublish: false, canSubscribe: true } });
const [h, b, sig] = tok.split('.');
const body = JSON.parse(Buffer.from(b, 'base64url').toString());
check('ticket is signed with the secret', sig === crypto.createHmac('sha256', 'SECRET').update(`${h}.${b}`).digest('base64url'));
check('ticket: issuer, room, listen only, expires', body.iss === 'KEY' && body.video.room === '73822762' && body.video.canPublish === false && body.exp - body.nbf <= 70);

// The handler
const res = () => { const r = { code: 0, json: null, headers: {} }; r.status = (c) => { r.code = c; return r; }; r.json = (j) => { r.body = j; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; return r; };
const env = { ...process.env };
delete process.env.LIVEKIT_URL;
let r = res(); await live({ method: 'GET', query: { id: '73822762' } }, r);
check('no keys set: 501, the stream page carries on', r.code === 501);

process.env.LIVEKIT_URL = 'wss://test.livekit.cloud'; process.env.LIVEKIT_API_KEY = 'KEY'; process.env.LIVEKIT_API_SECRET = 'SECRET';
const calls = [];
globalThis.fetch = async (url, opt) => {
    calls.push({ url, body: JSON.parse(opt.body), auth: opt.headers.authorization });
    if (url.endsWith('/ListRooms')) return { ok: true, json: async () => ({ rooms: [
        { name: '11111111', metadata: JSON.stringify({ lobby: 'zaal', host: 'Zaal', started: 1 }), num_publishers: 1 },
        { name: '22222222', metadata: JSON.stringify({ lobby: 'zaal', host: 'Zaal', started: 2 }), num_publishers: 1 },
        { name: '33333333', metadata: JSON.stringify({ lobby: 'zaal', started: 3 }), num_publishers: 0 },
    ] }) };
    return { ok: true, json: async () => ({}) };
};
r = res(); await live({ method: 'POST', body: { lobby: 'Zaal', name: 'Zaal' } }, r);
check('POST: a new 8-digit stream, its own link, a host ticket', r.code === 200 && STREAM_ID.test(r.body.id) && r.body.link === `/stream/${r.body.id}` && r.body.lobby === 'zaal');
const created = calls.find((c) => c.url === 'https://test.livekit.cloud/twirp/livekit.RoomService/CreateRoom');
check('POST: the room is made with the lobby in it and closes when empty', created && created.body.name === r.body.id && JSON.parse(created.body.metadata).lobby === 'zaal' && created.body.empty_timeout === 300);
const hostGrant = JSON.parse(Buffer.from(r.body.token.split('.')[1], 'base64url').toString()).video;
check('POST: the host may send, only into its own room', hostGrant.canPublish === true && hostGrant.room === r.body.id);
r = res(); await live({ method: 'GET', query: { id: '22222222' } }, r);
const listenGrant = JSON.parse(Buffer.from(r.body.token.split('.')[1], 'base64url').toString()).video;
check('GET ?id: a listener may only listen, in a stream that exists', r.code === 200 && listenGrant.canSubscribe === true && listenGrant.canPublish === false && listenGrant.canPublishData === false);
r = res(); await live({ method: 'GET', query: { id: '73822762' } }, r);
check('GET ?id for a stream that ended or never was: 404, no empty room opened', r.code === 404 && !r.body.token);
r = res(); await live({ method: 'GET', query: { lobby: 'zaal' } }, r);
check('GET ?lobby: the newest stream that is actually sending', r.code === 200 && r.body.id === '22222222' && r.body.link === '/stream/22222222');
r = res(); await live({ method: 'GET', query: { lobby: 'nobody' } }, r);
check('GET ?lobby with nobody live: 404', r.code === 404);
r = res(); await live({ method: 'GET', query: { id: '../../x' } }, r);
check('a bad id gets no ticket', r.code === 400);
globalThis.fetch = async () => ({ ok: false, status: 500 });
r = res(); await live({ method: 'POST', body: {} }, r);
check('stream server down: 502 with a plain message, no secrets', r.code === 502 && !JSON.stringify(r.body).includes('SECRET'));

Object.assign(process.env, env);
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
