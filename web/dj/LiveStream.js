// LiveStream.js — the set's sound to listeners through LiveKit, one link per stream
//
// Zaal, 6 Nov: "U need a slug. It can't always be stream. It needs to be Mixz.com/stream73822762
// so it actually tied to lobbies" and "We need audio from it". Research: ZAOresearch 2428.
// The host's stream page asks /api/live for a new stream id, sends the master mix once, and sends
// what is on air (song, time, up next) as small data messages. LiveKit fans both out. A listener
// opens mixz.com/stream/<id> (listen.html) and hears the mix itself, crossfades and FX included.
//
// livekit-client loads from the CDN only when a stream starts, so the desk never waits on it.

export const LIVEKIT_SRC = 'https://cdn.jsdelivr.net/npm/livekit-client@2.22.4/dist/livekit-client.esm.mjs';
export const STREAM_ID = /^\d{8}$/;

// /stream/73822762 -> '73822762'; anything else -> ''
export function streamIdFrom(pathname) {
    const m = /^\/stream\/(\d{8})\/?$/.exec(String(pathname || ''));
    return m ? m[1] : '';
}

// /lobby/zaal -> 'zaal'
export function lobbyFrom(pathname) {
    const m = /^\/lobby\/([a-z0-9][a-z0-9-]{1,30})\/?$/i.exec(String(pathname || ''));
    return m ? m[1].toLowerCase() : '';
}

// What a listener needs to draw the card, kept small: a data message goes out every second.
export function cardMessage(card) {
    return {
        t: 'card', on: !!card.on, title: String(card.title || '').slice(0, 80), artist: String(card.artist || '').slice(0, 60),
        progress: Math.round((card.progress || 0) * 1000) / 1000, time: String(card.time || ''), next: String(card.next || '').slice(0, 120),
        deck: card.deck || '', art: typeof card.art === 'string' && /^https:\/\//.test(card.art) ? card.art.slice(0, 400) : '',
    };
}

let lk = null;
const loadLiveKit = () => (lk ||= import(LIVEKIT_SRC));
// Tests swap in a fake livekit-client (no network).
export const useLiveKitForTests = (mod) => { lk = Promise.resolve(mod); };

// Host: start a stream for this lobby ('' for none). Resolves { id, link } or null when live
// streaming is not set up (501) or the server said no; the stream page then works as before.
export async function startHost(dj, { lobby = '', name = 'Host', getCard, fetchImpl = fetch } = {}) {
    let info;
    try {
        const r = await fetchImpl('/api/live', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lobby, name }) });
        if (r.status === 409) return { busy: true };   // someone is already live in this lobby
        if (!r.ok) return null;
        info = await r.json();
    } catch (e) { return null; }
    const { Room, Track } = await loadLiveKit();
    const room = new Room({ adaptiveStream: false, dynacast: false });
    await room.connect(info.url, info.token);
    const ctx = dj.audioRouter?.ctx;
    const dest = ctx.createMediaStreamDestination();
    dj.audioRouter.masterAnalyser.connect(dest);        // the master mix, after MASTER (so MUTE mutes it)
    const track = dest.stream.getAudioTracks()[0];
    try {
        await room.localParticipant.publishTrack(track, {
            name: 'mix', source: Track.Source.Microphone, dtx: false, red: false,
            audioPreset: { maxBitrate: 128_000 }, forceStereo: true,
        });
    } catch (e) {   // could not send the mix: leave the room instead of holding it open
        try { dj.audioRouter.masterAnalyser.disconnect(dest); } catch (err) { /* already */ }
        await room.disconnect();
        return null;
    }
    const enc = new TextEncoder();
    const beat = setInterval(() => {
        try { room.localParticipant.publishData(enc.encode(JSON.stringify(cardMessage(getCard?.() || {}))), { reliable: false }); } catch (e) { /* next beat */ }
    }, 1000);
    // End the stream for everyone: the server deletes the room, so listeners see "ended" at once
    // instead of waiting in an open room (specs/stream.qnt, rule 1). keepalive lets it go out on pagehide.
    let stopped = false;
    const stop = async () => {
        if (stopped) return;
        stopped = true;
        clearInterval(beat);
        try { dj.audioRouter.masterAnalyser.disconnect(dest); } catch (e) { /* already */ }
        try { await fetchImpl(`/api/live?id=${encodeURIComponent(info.id)}`, { method: 'DELETE', headers: { authorization: `Bearer ${info.token}` }, keepalive: true }); } catch (e) { /* listeners still time out */ }
        await room.disconnect();
    };
    addEventListener('pagehide', () => { stop(); });
    return { id: info.id, link: info.link, lobby: info.lobby, room, stop };
}

// Is a host's audio track already playing in this room?
export function hearingMix(room, Track) {
    for (const p of room.remoteParticipants?.values?.() || []) {
        for (const pub of p.trackPublications?.values?.() || []) if (pub.kind === Track.Kind.Audio && pub.track) return true;
    }
    return false;
}

// How long a listener waits for the mix to come back before the page says the stream ended.
// Covers a DJ whose laptop died or lost power, so STOP never reached the server.
export const GRACE_MS = 45_000;

// Listener: join stream <id>, play the mix through <audio>, call onCard with each card.
export async function listen(id, { onCard, onState, audioEl, fetchImpl = fetch, graceMs = GRACE_MS } = {}) {
    const r = await fetchImpl(`/api/live?id=${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error(r.status === 501 ? 'Live streams are not switched on yet.' : r.status === 404 ? 'This stream has ended.' : 'Could not get into this stream.');
    const info = await r.json();
    const { Room, RoomEvent, Track } = await loadLiveKit();
    const room = new Room({ adaptiveStream: false });
    const dec = new TextDecoder();
    let quiet = null;
    const hush = () => { clearTimeout(quiet); quiet = null; };
    const waitForMix = () => {
        onState?.('waiting');
        hush();
        quiet = setTimeout(() => { if (!hearingMix(room, Track)) room.disconnect(); }, graceMs);
    };
    room.on(RoomEvent.TrackSubscribed, (track) => { if (track.kind === Track.Kind.Audio) { hush(); track.attach(audioEl); onState?.('playing'); } });
    room.on(RoomEvent.TrackUnsubscribed, (track) => { track.detach(); waitForMix(); });
    room.on(RoomEvent.DataReceived, (payload) => { try { const m = JSON.parse(dec.decode(payload)); if (m.t === 'card') onCard?.(m); } catch (e) { /* not ours */ } });
    room.on(RoomEvent.Disconnected, () => { hush(); onState?.('ended'); });
    await room.connect(info.url, info.token);
    // The mix may already be playing (TrackSubscribed fires during connect): say so, never undo it.
    if (hearingMix(room, Track)) onState?.('playing'); else waitForMix();
    return room;
}
