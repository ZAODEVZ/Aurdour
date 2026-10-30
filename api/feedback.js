// api/feedback.js — where the FEEDBACK page sends what people write (Zaal, 16 Oct 2026).
// Vercel runs this as a serverless function at /api/feedback.
//
// It forwards each message to whichever of these is set in the Vercel project's environment
// (never in git):
//   FEEDBACK_TG_TOKEN + FEEDBACK_TG_CHAT      a Telegram bot token and the chat it posts to
//   FEEDBACK_GITHUB_TOKEN [+ FEEDBACK_GITHUB_REPO, default bettercallzaal/ZAOMixZ]
//                                              opens a GitHub issue labelled "feedback"
// With neither set it answers 501, and the page offers copy / open-as-issue instead.

const KINDS = ['Bug', 'Idea', 'Love it', 'Song request', 'Other'];
const MAX = 2000;

// The message cleaned and checked, or an error string.
function clean(body) {
    if (!body || typeof body !== 'object') return 'no message';
    if (body.website) return 'spam'; // a hidden field only bots fill in
    const message = String(body.message || '').trim().slice(0, MAX);
    if (message.length < 3) return 'write a few words first';
    return {
        kind: KINDS.includes(body.kind) ? body.kind : 'Other',
        message,
        contact: String(body.contact || '').trim().slice(0, 120),
        nowPlaying: String(body.nowPlaying || '').trim().slice(0, 200),
        page: String(body.page || '').trim().slice(0, 200),
        device: String(body.device || '').trim().slice(0, 200),
    };
}

function asText(f) {
    return [
        `ZAO MixZ feedback: ${f.kind}`,
        '',
        f.message,
        '',
        f.contact ? `From: ${f.contact}` : 'From: (no name given)',
        f.nowPlaying ? `Playing: ${f.nowPlaying}` : '',
        f.device ? `Device: ${f.device}` : '',
    ].filter((l, i) => l || i < 4).join('\n');
}

async function toTelegram(f, env, fetchFn) {
    const res = await fetchFn(`https://api.telegram.org/bot${env.FEEDBACK_TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: env.FEEDBACK_TG_CHAT, text: asText(f), disable_web_page_preview: true }),
    });
    if (!res.ok) throw new Error(`telegram ${res.status}`);
}

async function toGitHub(f, env, fetchFn) {
    const repo = env.FEEDBACK_GITHUB_REPO || 'bettercallzaal/ZAOMixZ';
    const res = await fetchFn(`https://api.github.com/repos/${repo}/issues`, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.FEEDBACK_GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'zao-mixz-feedback' },
        body: JSON.stringify({ title: `${f.kind}: ${f.message.split('\n')[0].slice(0, 70)}`, body: asText(f), labels: ['feedback'] }),
    });
    if (!res.ok) throw new Error(`github ${res.status}`);
}

// A cap so one script cannot flood Zaal's Telegram and the issues (doc 1971): per sender, and for
// everyone together. Kept in memory, so it counts per running copy of the function; a Vercel
// firewall rate-limit rule on /api/feedback is the hard stop on top of this.
const PER_IP = 5, ALL = 30, WINDOW_MS = 60 * 60 * 1000;
const sends = new Map(); // ip -> times, '*' -> everyone

function tooMany(ip, now = Date.now()) {
    const recent = (k) => (sends.get(k) || []).filter((t) => now - t < WINDOW_MS);
    const mine = ip ? recent(ip) : [], all = recent('*');
    if ((ip && mine.length >= PER_IP) || all.length >= ALL) return true;
    if (ip) sends.set(ip, [...mine, now]);
    sends.set('*', [...all, now]);
    if (sends.size > 5000) sends.clear();
    return false;
}

async function handle(method, body, env = process.env, fetchFn = fetch, ip = '') {
    if (method !== 'POST') return [405, { ok: false, error: 'POST only' }];
    if (tooMany(ip)) return [429, { ok: false, error: 'too many messages, try again later' }];
    const f = clean(typeof body === 'string' ? (() => { try { return JSON.parse(body); } catch { return null; } })() : body);
    if (typeof f === 'string') return [f === 'spam' ? 200 : 400, f === 'spam' ? { ok: true } : { ok: false, error: f }];
    const routes = [];
    if (env.FEEDBACK_TG_TOKEN && env.FEEDBACK_TG_CHAT) routes.push(['telegram', toTelegram]);
    if (env.FEEDBACK_GITHUB_TOKEN) routes.push(['github', toGitHub]);
    if (!routes.length) return [501, { ok: false, configured: false, error: 'feedback is not connected yet' }];
    const sent = [];
    for (const [name, send] of routes) {
        try { await send(f, env, fetchFn); sent.push(name); } catch (e) { console.error('[feedback]', name, e.message); }
    }
    return sent.length ? [200, { ok: true, sent }] : [502, { ok: false, error: 'could not deliver, try again' }];
}

module.exports = async (req, res) => {
    const ip = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const [status, json] = await handle(req.method, req.body, process.env, fetch, ip);
    res.status(status).json(json);
};
module.exports.handle = handle;
module.exports.tooMany = tooMany;
module.exports.clean = clean;
module.exports.asText = asText;
