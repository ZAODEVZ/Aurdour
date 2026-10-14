// remote.js — the phone side of MixZ Remote
// Opens from the link or QR code shown by PHONE on the desktop. Connects straight to that
// desktop, draws the set five times a second, and sends taps and slides back.

import { validToken, Relay, loadPeer } from './dj/RemoteLink.js';
import { Install } from './dj/Install.js';

const $ = id => document.getElementById(id);
// The link carries the key after the #. An installed app opens without it, so the last good
// one is kept on this phone and used again.
const fromLink = location.hash.slice(1);
if (validToken(fromLink)) localStorage.setItem('mixz-remote-link', fromLink);
const token = validToken(fromLink) ? fromLink : (localStorage.getItem('mixz-remote-link') || '');
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// This phone's own id, so the desk only has to allow it once.
let device = localStorage.getItem('mixz-remote-device');
if (!/^[a-f0-9]{24}$/.test(device || '')) {
    device = [...crypto.getRandomValues(new Uint8Array(12))].map(x => x.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('mixz-remote-device', device);
}
const phoneName = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android phone' : 'Phone';

let relay = null, ready = false, state = null, lastState = 0, listening = false, peer = null, call = null;
const held = {};   // sliders being dragged right now: the desk's value must not fight the thumb

function status(text, live = false) {
    $('status').textContent = text;
    $('dot').classList.toggle('live', live);
}
function gate(title, text) {
    ready = false;
    $('gate').classList.remove('hidden');
    $('gate').innerHTML = '';
    const b = document.createElement('b'); b.textContent = title;
    $('gate').append(b, document.createTextNode(text));
    for (const t of ['mix', 'pads', 'tracks', 'auto']) $(`tab-${t}`).classList.add('hidden');
    $('nav').classList.add('hidden');
    $('listen').classList.add('hidden');
}
function enter() {
    if (ready) return;
    ready = true;
    $('gate').classList.add('hidden');
    $('nav').classList.remove('hidden');
    $('listen').classList.remove('hidden');
    showTab('mix');
    keepAwake();
}
function send(a, extra = {}) {
    if (ready) relay?.send({ t: 'cmd', device, a, ...extra });
    if (navigator.vibrate) navigator.vibrate(8);
}

async function connect() {
    if (!validToken(token)) { gate('This link is not complete', 'Open PHONE on the computer and scan the code again.'); status('No link'); return; }
    if (!window.isSecureContext || !crypto.subtle) { gate('Open this over https', 'The link is sealed, and the browser only allows that on a secure page.'); status('Not secure'); return; }
    status('Connecting');
    relay = new Relay({ token, role: 'phone', onMessage: onData, onStatus: up => { if (!up) status('No internet'); else if (!ready) status('Looking for the desk'); } });
    try { await relay.open(); } catch (e) { gate('No internet', 'This page keeps trying.'); setTimeout(connect, 4000); return; }
    // Say hello now and every two seconds: that is also how the desk knows this phone is still here.
    const hello = () => relay.send({ t: 'hello', device, name: phoneName });
    hello();
    setInterval(hello, 2000);
    setInterval(watch, 1000);
}
// The desk sends the set five times a second. Silence means it is closed or offline.
let askedSince = Date.now();
function watch() {
    if (ready && Date.now() - lastState > 5000) {
        gate('Lost the decks', 'Is ZAO MixZ still open on the computer? This page keeps trying.');
        status('Reconnecting');
        askedSince = Date.now();
    } else if (!ready && relay?.online && $('status').textContent === 'Looking for the desk' && Date.now() - askedSince > 8000) {
        gate('Your decks are not online', 'Open ZAO MixZ on the computer and switch PHONE on. This page keeps trying.');
    }
}

function onData(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.to && msg.to !== device) return;
    if (msg.t === 'wait') { if (!ready) { gate('Almost there', 'Tap ALLOW on the computer. You only do this once for this phone.'); status('Waiting for the desk'); } }
    else if (msg.t === 'denied') { gate('The desk said no', 'Ask whoever is at the computer to allow this phone.'); status('Not allowed'); }
    else if (msg.t === 'welcome') { lastState = Date.now(); enter(); status('Live', true); }
    else if (msg.t === 'state') { if (!ready) return; state = msg; lastState = Date.now(); status('Live', true); draw(); }
    else if (msg.t === 'tracks') drawTracks(msg.list || []);
}

// ── Drawing ──

function buildDeck(el) {
    const d = el.dataset.deck;
    el.innerHTML = `
        <div class="who"><span class="tag">${d}</span><span class="title" data-f="title">No track</span><span class="bpm" data-f="bpm"></span></div>
        <div class="artist" data-f="artist"></div>
        <div class="bar"><i data-f="bar"></i></div>
        <div class="time"><span data-f="time">0:00</span><span data-f="left">-0:00</span></div>
        <div class="row t">
            <button class="b-cue" data-cmd="cue" data-d="${d}">CUE</button>
            <button class="b-play" data-cmd="play" data-d="${d}" data-f="play">PLAY</button>
            <button class="b-sync" data-cmd="sync" data-d="${d}">SYNC</button>
        </div>
        <div class="row x">
            <button data-loop="${d}" data-f="loop">LOOP 4</button>
            <button data-cmd="fxfade" data-d="${d}" data-n="0" data-f="fade">FADE OUT</button>
            <button data-cmd="fxfade" data-d="${d}" data-n="3">SPIN DOWN</button>
        </div>`;
}
function draw() {
    if (!state) return;
    for (const d of ['A', 'B']) {
        const s = state[d], el = document.querySelector(`.deck.${d}`);
        const f = k => el.querySelector(`[data-f="${k}"]`);
        f('title').textContent = s.loaded ? (s.title || 'Untitled') : 'No track';
        f('artist').textContent = s.loaded ? s.artist : '';
        f('bpm').textContent = s.bpm ? `${(s.bpm * (s.rate || 1)).toFixed(1)} BPM` : '';
        f('bar').style.width = s.dur ? `${Math.min(100, s.time / s.dur * 100)}%` : '0';
        f('time').textContent = fmt(s.time);
        f('left').textContent = `-${fmt(Math.max(0, s.dur - s.time))}`;
        f('play').textContent = s.playing ? 'PAUSE' : 'PLAY';
        f('loop').classList.toggle('on', s.loop);
        f('loop').textContent = s.loop ? 'LOOP OFF' : 'LOOP 4';
        f('fade').classList.toggle('on', s.fading);
        el.classList.toggle('live', s.playing);
        document.querySelectorAll(`[data-cues="${d}"] button`).forEach((b, i) => b.classList.toggle('set', !!s.cues?.[i]));
    }
    if (!held.xf) $('xf').value = Math.round(state.xf * 1000);
    if (!held.master) $('master').value = Math.round(state.master * 1000);
    for (const d of ['A', 'B']) if (!held[`vol-${d}`]) $(`vol-${d}`).value = Math.round(state.vol[d] * 1000);
    const m = state.mixz;
    $('mixz-stop').classList.toggle('hidden', !m.running);
    $('mixz-say').textContent = !m.running ? 'DJ MixZ is off.' : m.human ? 'You have the decks. DJ MixZ is watching.' : 'DJ MixZ is mixing.';
}
function drawTracks(list) {
    const box = $('tracks');
    box.textContent = '';
    if (!list.length) { box.textContent = 'Nothing here. Open a crate on the computer, or search.'; return; }
    for (const t of list) {
        const row = document.createElement('div'); row.className = 'track';
        const info = document.createElement('div');
        const b = document.createElement('b'); b.textContent = t.title || 'Untitled';
        const small = document.createElement('small'); small.textContent = [t.artist, t.bpm ? `${Math.round(t.bpm)} BPM` : '', t.key || ''].filter(Boolean).join('  ·  ');
        info.append(b, small);
        const la = document.createElement('button'); la.className = 'la'; la.textContent = 'A'; la.onclick = () => send('load', { d: 'A', id: t.id });
        const lb = document.createElement('button'); lb.className = 'lb'; lb.textContent = 'B'; lb.onclick = () => send('load', { d: 'B', id: t.id });
        row.append(info, la, lb);
        box.appendChild(row);
    }
}
function showTab(name) {
    for (const t of ['mix', 'pads', 'tracks', 'auto']) $(`tab-${t}`).classList.toggle('hidden', t !== name);
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    if (name === 'tracks') send('tracks', { q: $('search').value });
}

// ── Wiring ──

document.querySelectorAll('.deck').forEach(buildDeck);
document.querySelectorAll('[data-cues]').forEach(grid => {
    for (let i = 0; i < 8; i++) {
        const b = document.createElement('button');
        b.textContent = i + 1;
        b.onclick = () => send('hotcue', { d: grid.dataset.cues, n: i });
        grid.appendChild(b);
    }
});
document.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.cmd) send(b.dataset.cmd, { d: b.dataset.d, ...(b.dataset.n != null ? { n: Number(b.dataset.n) } : {}) });
    else if (b.dataset.loop) send('loop', { d: b.dataset.loop, beats: state?.[b.dataset.loop]?.loop ? 0 : 4 });
    else if (b.dataset.next) send('next', { mode: b.dataset.next });
    else if (b.dataset.tab) showTab(b.dataset.tab);
});
// Sliders send while they move, at most 25 times a second.
function slider(id, make) {
    const el = $(id);
    let last = 0, pending = null;
    const push = () => { last = Date.now(); pending = null; const c = make(Number(el.value) / 1000); send(c.a, c); };
    el.addEventListener('input', () => {
        held[id] = true;
        if (Date.now() - last > 40) push();
        else if (!pending) pending = setTimeout(push, 40);
    });
    const release = () => setTimeout(() => { held[id] = false; }, 400);
    el.addEventListener('change', release);
    el.addEventListener('touchend', release);
}
slider('xf', v => ({ a: 'crossfader', v }));
slider('master', v => ({ a: 'master', v }));
slider('vol-A', v => ({ a: 'volume', d: 'A', v }));
slider('vol-B', v => ({ a: 'volume', d: 'B', v }));
$('mixz-go').onclick = () => send('songchainn');
$('mixz-stop').onclick = () => send('mixz', { on: false });
$('mixz-take').onclick = () => send('takeover');
$('mixz-back').onclick = () => send('handback');
let searchTimer = null;
$('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => send('tracks', { q: $('search').value }), 300); });
$('listen').onclick = async () => {
    listening = !listening;
    $('listen').classList.toggle('on', listening);
    if (!listening) {
        $('listen').textContent = 'LISTEN';
        try { call?.close(); } catch (e) { /* gone */ }
        $('monitor').srcObject = null;
        send('listen', { on: false });
        return;
    }
    $('listen').textContent = 'CALLING';
    $('monitor').play().catch(() => {});   // this tap is what lets the phone play sound
    try {
        await loadPeer();
        if (!peer || peer.destroyed) {
            peer = new window.Peer();
            peer.on('call', incoming => {
                call = incoming;
                incoming.answer();
                incoming.on('stream', stream => { $('monitor').srcObject = stream; $('monitor').play().catch(() => {}); $('listen').textContent = 'LISTENING'; });
            });
            await new Promise((resolve, reject) => { peer.on('open', resolve); peer.on('error', reject); });
        }
        send('listen', { on: true, peer: peer.id });
        // Sound needs a direct line between the two networks. Some networks refuse it.
        setTimeout(() => { if (listening && $('listen').textContent === 'CALLING') { $('listen').textContent = 'NO SOUND LINK'; } }, 12000);
    } catch (e) {
        $('listen').textContent = 'NO SOUND LINK';
    }
};

// Keep the screen on while the set is in hand, and come back when the phone wakes.
let wake = null;
async function keepAwake() { try { wake = await navigator.wakeLock?.request('screen'); } catch (e) { /* not allowed */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ready) keepAwake(); });

new Install({ button: $('install-btn'), sheet: $('install-sheet'), appName: 'ZAO MixZ Remote' });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
connect();
