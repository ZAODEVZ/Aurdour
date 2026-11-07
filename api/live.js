// api/live.js — one link per stream (Zaal, 6 Nov 2026: "U need a slug. It can't always be stream.
// It needs to be Mixz.com/stream73822762 so it actually tied to lobbies"). Research: ZAOresearch 2428.
//
// The sound goes through LiveKit (open source SFU, Zaal: "Anything opensource is always a go"):
// the host sends the mix once, LiveKit fans it out, listeners hear it in under a second. This
// replaces the free public relays and the laptop-to-every-listener calls that made /stream glitchy.
//
//   POST /api/live {lobby?, name?}  -> a new stream: { id, link, url, token } (host may publish)
//   GET  /api/live?id=73822762      -> a listener ticket: { id, url, token } (listen only), 404 once it ended
//   GET  /api/live?lobby=zaal       -> the lobby's stream that is live now: { id, link } or 404
//   DELETE /api/live?id=73822762    -> the host ends the stream (Authorization: Bearer <host token>);
//                                      everyone listening hears it end at once
//
// The rules below are checked in specs/stream.qnt (Quint, ZAOresearch 2438): nobody gets stuck in
// a stream that ended, and a lobby has one live stream at a time.
//
// Set in the Vercel project's environment (never in git):
//   LIVEKIT_URL         wss://<project>.livekit.cloud  (or a self-hosted LiveKit server)
//   LIVEKIT_API_KEY     the project's API key
//   LIVEKIT_API_SECRET  the project's API secret
// Without them every call answers 501 and the stream page carries on as before.
// The key belongs to the app and stays on the server: a browser only ever gets a short ticket.

const crypto = require('crypto');

const ID = /^\d{8}$/;
const LOBBY = /^[a-z0-9][a-z0-9-]{1,30}$/;
const HOST_TTL = 8 * 3600;      // a set can run 8 hours
const LISTEN_TTL = 6 * 3600;

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

// A LiveKit access token: a JWT signed with the API secret (docs.livekit.io, "Tokens and grants").
function ticket(key, secret, { identity, name = '', video, ttl, metadata }) {
    const now = Math.floor(Date.now() / 1000);
    const body = { iss: key, sub: identity, nbf: now - 10, exp: now + ttl, video };
    if (name) body.name = name;
    if (metadata) body.metadata = metadata;
    const head = b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url(body);
    return head + '.' + crypto.createHmac('sha256', secret).update(head).digest('base64url');
}

const newId = () => String(crypto.randomInt(10_000_000, 100_000_000));
const cleanLobby = (s) => { const v = String(s || '').trim().toLowerCase(); return LOBBY.test(v) ? v : ''; };
const httpBase = (url) => String(url).replace(/^ws/, 'http').replace(/\/+$/, '');

// LiveKit's room API (Twirp over HTTP), signed with a short admin ticket.
async function roomApi(env, method, body, video) {
    const t = ticket(env.key, env.secret, { identity: 'mixz-api', video, ttl: 60 });
    const r = await fetch(`${httpBase(env.url)}/twirp/livekit.RoomService/${method}`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`LiveKit ${method} ${r.status}`);
    return r.json();
}

// The newest stream in this lobby that is sending the mix, or null.
async function liveInLobby(env, lobby) {
    const { rooms = [] } = await roomApi(env, 'ListRooms', {}, { roomList: true });
    return rooms
        .map((r) => { try { return { id: r.name, meta: JSON.parse(r.metadata || '{}'), n: r.num_publishers ?? r.numPublishers ?? 0 }; } catch { return null; } })
        .filter((r) => r && ID.test(r.id) && r.meta.lobby === lobby && r.n > 0)
        .sort((a, b) => (b.meta.started || 0) - (a.meta.started || 0))[0] || null;
}

// Is this a host ticket we signed for stream <id>, still in date? Only the host may end a stream.
function isHostOf(token, id, secret) {
    const [h, b, sig] = String(token || '').split('.');
    if (!h || !b || !sig) return false;
    const good = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
    if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
    try {
        const body = JSON.parse(Buffer.from(b, 'base64url').toString());
        return body.sub === `host-${id}` && body.video?.room === id && body.exp > Date.now() / 1000;
    } catch { return false; }
}

async function handler(req, res) {
    const env = { url: process.env.LIVEKIT_URL, key: process.env.LIVEKIT_API_KEY, secret: process.env.LIVEKIT_API_SECRET };
    res.setHeader('cache-control', 'no-store');
    if (!env.url || !env.key || !env.secret) return res.status(501).json({ error: 'live streaming is not set up yet' });
    try {
        if (req.method === 'POST') {
            const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
            const lobby = cleanLobby(body.lobby);
            const name = String(body.name || 'Host').trim().slice(0, 40) || 'Host';
            // One live stream per lobby: a second DJ is told, instead of splitting the listeners.
            if (lobby && await liveInLobby(env, lobby)) return res.status(409).json({ error: 'someone is live in this lobby, try another lobby or wait' });
            const id = newId();
            const metadata = JSON.stringify({ lobby, host: name, started: Date.now() });
            // The room closes 5 minutes after everyone leaves.
            await roomApi(env, 'CreateRoom', { name: id, empty_timeout: 300, metadata }, { roomCreate: true });
            const token = ticket(env.key, env.secret, {
                identity: `host-${id}`, name, ttl: HOST_TTL,
                video: { room: id, roomJoin: true, canPublish: true, canPublishData: true, canSubscribe: false },
            });
            return res.status(200).json({ id, link: `/stream/${id}`, lobby, url: env.url, token });
        }
        if (req.method === 'GET') {
            const id = String(req.query?.id || '');
            if (ID.test(id)) {
                // Only for a stream that exists: LiveKit would otherwise open an empty room for any
                // 8-digit guess, and every listener minute in it counts against the plan.
                const { rooms = [] } = await roomApi(env, 'ListRooms', { names: [id] }, { roomList: true });
                // A room the DJ has left is over, even while old listeners keep it open.
                const room = rooms.find((r) => r.name === id);
                if (!room || !((room.num_publishers ?? room.numPublishers ?? 0) > 0)) return res.status(404).json({ error: 'this stream has ended' });
                const token = ticket(env.key, env.secret, {
                    identity: `listen-${crypto.randomBytes(5).toString('hex')}`, ttl: LISTEN_TTL,
                    video: { room: id, roomJoin: true, canPublish: false, canPublishData: false, canSubscribe: true },
                });
                return res.status(200).json({ id, url: env.url, token });
            }
            const lobby = cleanLobby(req.query?.lobby);
            if (lobby) {
                const live = await liveInLobby(env, lobby);
                return live ? res.status(200).json({ id: live.id, link: `/stream/${live.id}`, host: live.meta.host || '' }) : res.status(404).json({ error: 'nobody is live in this lobby' });
            }
            return res.status(400).json({ error: 'ask with ?id= or ?lobby=' });
        }
        if (req.method === 'DELETE') {
            const id = String(req.query?.id || '');
            if (!ID.test(id)) return res.status(400).json({ error: 'ask with ?id=' });
            const auth = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
            if (!isHostOf(auth, id, env.secret)) return res.status(403).json({ error: 'only the host can end this stream' });
            await roomApi(env, 'DeleteRoom', { room: id }, { roomCreate: true });
            return res.status(200).json({ id, ended: true });
        }
        return res.status(405).json({ error: 'GET, POST or DELETE' });
    } catch (e) {
        return res.status(502).json({ error: 'the stream server did not answer, try again' });
    }
}

module.exports = handler;
module.exports.ticket = ticket;
module.exports.newId = newId;
module.exports.cleanLobby = cleanLobby;
module.exports.isHostOf = isHostOf;
