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

// Host: start a stream for this lobby ('' for none). Resolves { id, link } or null when live
// streaming is not set up (501) or the server said no; the stream page then works as before.
export async function startHost(dj, { lobby = '', name = 'Host', getCard, fetchImpl = fetch } = {}) {
    let info;
    try {
        const r = await fetchImpl('/api/live', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lobby, name }) });
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
    await room.localParticipant.publishTrack(track, {
        name: 'mix', source: Track.Source.Microphone, dtx: false, red: false,
        audioPreset: { maxBitrate: 128_000 }, forceStereo: true,
    });
    const enc = new TextEncoder();
    const beat = setInterval(() => {
        try { room.localParticipant.publishData(enc.encode(JSON.stringify(cardMessage(getCard?.() || {}))), { reliable: false }); } catch (e) { /* next beat */ }
    }, 1000);
    const stop = async () => { clearInterval(beat); try { dj.audioRouter.masterAnalyser.disconnect(dest); } catch (e) { /* already */ } await room.disconnect(); };
    addEventListener('pagehide', () => { stop(); });
    return { id: info.id, link: info.link, lobby: info.lobby, room, stop };
}

// Listener: join stream <id>, play the mix through <audio>, call onCard with each card.
export async function listen(id, { onCard, onState, audioEl, fetchImpl = fetch } = {}) {
    const r = await fetchImpl(`/api/live?id=${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error(r.status === 501 ? 'Live streams are not switched on yet.' : 'Could not get into this stream.');
    const info = await r.json();
    const { Room, RoomEvent, Track } = await loadLiveKit();
    const room = new Room({ adaptiveStream: false });
    const dec = new TextDecoder();
    room.on(RoomEvent.TrackSubscribed, (track) => { if (track.kind === Track.Kind.Audio) { track.attach(audioEl); onState?.('playing'); } });
    room.on(RoomEvent.TrackUnsubscribed, (track) => { track.detach(); onState?.('waiting'); });
    room.on(RoomEvent.DataReceived, (payload) => { try { const m = JSON.parse(dec.decode(payload)); if (m.t === 'card') onCard?.(m); } catch (e) { /* not ours */ } });
    room.on(RoomEvent.Disconnected, () => onState?.('ended'));
    await room.connect(info.url, info.token);
    onState?.(room.remoteParticipants.size ? 'connected' : 'waiting');
    return room;
}
