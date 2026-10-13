#!/usr/bin/env node
// Live test: SongChainn songs load and play on a deck in ZAO MixZ.
// Picks one song from each SongChainn storage host in the ZAO crate, loads it on deck A in a
// real (headless) Chrome, plays it, and checks the waveform decoded and sound is flowing.
//
//   node pipeline/test_songchainn_live.mjs [http://localhost:8780/]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL_APP = process.argv[2] || 'http://localhost:8780/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9334;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mixz-sc-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-size=1366,768', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, seq = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
};
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed += 1; };

try {
    let target;
    for (let i = 0; i < 40 && !target; i++) { await sleep(500); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
    if (!target) throw new Error('Chrome did not start');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    ws.onmessage = (e) => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('aurdour-tutorial-done','true')}catch(e){}; window.__errs=[]; window.addEventListener('error',e=>window.__errs.push(String(e.message).slice(0,160))); window.addEventListener('unhandledrejection',e=>window.__errs.push('rejection: '+String(e.reason).slice(0,160)));" });
    await send('Page.navigate', { url: URL_APP });
    for (let i = 0; i < 60; i++) { await sleep(500); if (await evalJs("return !!(window._djPlayer && (window._djPlayer.library.zaoTracks||[]).some(t => t.source === 'songchainn'))").catch(() => false)) break; }

    const picks = await evalJs(`
        const p = window._djPlayer; const sc = (p.library.zaoTracks || []).filter(t => t.source === 'songchainn');
        const an = p.audioRouter.ctx.createAnalyser(); an.fftSize = 2048; p.audioRouter.masterGain.connect(an);
        window.__rms = () => { const b = new Float32Array(an.fftSize); an.getFloatTimeDomainData(b); let s = 0; for (const v of b) s += v * v; return Math.sqrt(s / b.length); };
        const byHost = {}; for (const t of sc) { const h = new URL(t.streamUrl).host; (byHost[h] = byHost[h] || []).push(t); }
        window.__picks = Object.values(byHost).map(a => a.find(t => /\\.mp3($|\\?)/i.test(t.streamUrl)) || a[0]);
        return { total: sc.length, hosts: Object.keys(byHost).map(h => h.slice(4, 12) + ' x' + byHost[h].length), picks: window.__picks.map(t => t.title) };`);
    check('SongChainn songs are in the ZAO crate', picks.total > 0, `${picks.total} songs across ${picks.hosts.length} storage hosts: ${picks.hosts.join(', ')}`);

    for (let i = 0; i < picks.picks.length; i++) {
        const r = await evalJs(`
            const p = window._djPlayer, A = p.decks.A, t = window.__picks[${i}];
            if (A.isPlaying) A.pause();
            A.isLoaded = false; const t0 = Date.now();
            p.library.loadToDeck(t, 'A');
            for (let k = 0; k < 180 && !A.isLoaded; k++) await new Promise(r => setTimeout(r, 500));
            const loadMs = Date.now() - t0;
            if (!A.isLoaded) return { title: t.title, host: new URL(t.streamUrl).host.slice(4, 12), loaded: false, loadMs };
            A.play(); await new Promise(r => setTimeout(r, 3500));
            let peak = 0; for (let k = 0; k < 6; k++) { peak = Math.max(peak, window.__rms()); await new Promise(r => setTimeout(r, 250)); }
            const out = { title: t.title, host: new URL(t.streamUrl).host.slice(4, 12), ext: t.streamUrl.split('.').pop().slice(0, 4), loaded: true, loadMs, dur: Math.round(A.getDuration()), time: +A.getCurrentTime().toFixed(1), playing: A.isPlaying, peak: +peak.toFixed(4), bpm: A.getBPM ? A.getBPM() : null, deckTitle: document.getElementById('deck-a-title')?.innerText, hasArt: !!t.artwork, cover: await (async () => { await new Promise(r => setTimeout(r, 900)); const b = document.querySelector('#deck-a .deck-label'); if (!t.artwork) return 'none'; if (!b.classList.contains('has-cover')) return 'missing'; return await new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth + 'px'); i.onerror = () => r('broken'); i.src = t.artwork; setTimeout(() => r('slow'), 15000); }); })() };
            A.pause(); return out;`);
        check(`host ${r.host}: "${r.title}" loads, plays, makes sound and shows its cover`, r.loaded && r.playing && r.time > 2 && r.peak > 0.001 && (r.cover === 'none' || /px$/.test(r.cover)),
            r.loaded ? `cover ${r.cover}, ${r.ext}, ${r.dur}s long, loaded in ${(r.loadMs / 1000).toFixed(1)}s, at ${r.time}s, level ${r.peak}${r.bpm ? ', ' + Math.round(r.bpm) + ' BPM measured' : ''}` : `did not load in ${(r.loadMs / 1000).toFixed(0)}s`);
    }
    const errs = await evalJs('return window.__errs');
    check('no page errors', errs.length === 0, errs.join(' ; '));
} catch (e) {
    console.log('FAIL  test run crashed:', e.message); failed += 1;
} finally {
    try { ws?.close(); } catch {}
    chrome.kill(); await sleep(800);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
