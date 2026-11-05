// Lobbies.js — the standing ZAO MixZ lobbies and their links (Zaal, 5 Nov 2026: "Can u make zao
// mixez lobbies. So zaal's lobby, guest lobby, and request a lobby. Then add a stream button from
// there. So zaomixez.com/stream/zaal will be mine").
//
// A lobby is a named seat (LiveMix.js): whoever streams from /stream/<lobby> holds it, and its
// watch link mix.html#lobby=<lobby> shows that set. Any other name works too; these are the ones
// the /lobbies page lists. Pure, runs under node: see Lobbies.test.mjs.

export const LOBBIES = [
    { room: 'zaal', name: "Zaal's lobby", about: "Zaal's own sets. Stream from here when Zaal is on the decks." },
    { room: 'guest', name: 'Guest lobby', about: 'For a guest DJ. Open it, stream, and the watch link follows your set.' },
];

const KNOWN = new Map(LOBBIES.map((l) => [l.room, l.name]));

// "zaal" -> "Zaal's lobby"; any other lobby -> "Lobby main-stage".
export const lobbyLabel = (room) => KNOWN.get(room) || `Lobby ${room}`;

// The two links every lobby has: where its host streams from, and where everyone watches.
export function lobbyLinks(origin, room) {
    const o = String(origin || '').replace(/\/$/, '');
    return { stream: `${o}/stream/${room}`, watch: `${o}/mix.html#lobby=${room}` };
}

// What a lobby request sends to /api/feedback, or an error string.
export function lobbyRequest({ lobby, who, contact, when } = {}) {
    const l = String(lobby || '').trim().slice(0, 40);
    const w = String(who || '').trim().slice(0, 80);
    if (l.length < 2) return 'give the lobby a name';
    if (w.length < 2) return 'say who will DJ in it';
    const lines = [`Lobby request: ${l}`, `DJ: ${w}`];
    const t = String(when || '').trim().slice(0, 120);
    if (t) lines.push(`When: ${t}`);
    return { kind: 'Lobby request', message: lines.join('\n'), contact: String(contact || '').trim().slice(0, 120), page: '/lobbies' };
}
