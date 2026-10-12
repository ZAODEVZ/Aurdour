#!/usr/bin/env node
// Live test of DJ MixZ in a real (headless) Chrome: builds a set from the LOCAL tab, starts
// it, then forces two handovers and checks that sound is flowing the whole time.
//
//   node pipeline/test_djmixz_live.mjs [http://localhost:8780/]
//
// Needs the app served locally and Chrome installed. Uses Chrome's remote debugging port.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL_APP = process.argv[2] || 'http://localhost:8780/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mixz-live-'));
const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-size=1366,768', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, seq = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
};

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed += 1; };

try {
    let target;
    for (let i = 0; i < 40 && !target; i++) {
        await sleep(500);
        try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    }
    if (!target) throw new Error('Chrome did not start');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    ws.onmessage = (e) => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };

    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('aurdour-tutorial-done','true')}catch(e){}; window.__errs=[]; window.addEventListener('error',e=>window.__errs.push(String(e.message).slice(0,160))); window.addEventListener('unhandledrejection',e=>window.__errs.push('rejection: '+String(e.reason).slice(0,160)));" });
    await send('Page.navigate', { url: URL_APP });
    for (let i = 0; i < 40; i++) { await sleep(500); if (await evalJs('return !!(window._djPlayer && window._djPlayer.djMixz && (window._djPlayer.library.tracks||[]).length)').catch(() => false)) break; }

    const built = await evalJs(`
        const p = window._djPlayer, m = p.djMixz;
        // a tap on master so the test can hear whether sound is flowing
        const ctx = p.audioRouter.ctx; const an = ctx.createAnalyser(); an.fftSize = 2048; p.audioRouter.masterGain.connect(an); window.__an = an;
        window.__rms = () => { const b = new Float32Array(an.fftSize); an.getFloatTimeDomainData(b); let s = 0; for (const v of b) s += v * v; return Math.sqrt(s / b.length); };
        const plan = m.build('local', 'journey', 0);
        return { n: plan.length, titles: plan.map(x => x.track.title), energies: plan.map(x => +x.energy.toFixed(2)), moves: plan.slice(1).map(x => x.move.type + ' ' + x.move.bars + ' bars ' + x.move.seconds + 's') };`);
    check('set built from the LOCAL tab', built.n >= 3, `${built.n} tracks`);
    console.log('      order:', built.titles.join(' > '));
    console.log('      moves:', built.moves.join(' | '));

    const started = await evalJs(`
        const p = window._djPlayer, m = p.djMixz, A = p.decks.A;
        const ok = m.start();
        for (let i = 0; i < 60 && !A.isLoaded; i++) await new Promise(r => setTimeout(r, 500));
        if (A.isLoaded && !A.isPlaying) A.play();
        await new Promise(r => setTimeout(r, 3000));
        return { ok, loaded: A.isLoaded, playing: A.isPlaying, t: +A.getCurrentTime().toFixed(1), rms: +window.__rms().toFixed(4), ctx: p.audioRouter.ctx.state, title: A.metadata?.metadata?.title, xf: document.getElementById('crossfader').value };`);
    check('START loads the first track on deck A and plays it', started.ok && started.loaded && started.playing && started.t > 1, `"${started.title}" at ${started.t}s`);
    check('sound is flowing on the master', started.rms > 0.001, `level ${started.rms}`);

    // Force a handover: jump the playing deck to just before the planned start point, then watch.
    const handover = async (n) => {
        const info = await evalJs(`
            const p = window._djPlayer, m = p.djMixz, f = p.flowMode; const cur = p.decks[f.currentDeck];
            const dur = cur.getDuration(); cur.wavesurfer.setTime(Math.max(0, dur - f.transitionPoint - 1.5));
            window.__levels = []; window.__lv = setInterval(() => window.__levels.push(+window.__rms().toFixed(4)), 500);
            return { from: f.currentDeck, move: m.plan[m.index + 1].move, point: f.transitionPoint, index: m.index };`);
        const budget = Math.ceil(info.move.seconds + info.point + 25);
        let state;
        for (let i = 0; i < budget; i++) {
            await sleep(1000);
            state = await evalJs(`const p = window._djPlayer, m = p.djMixz, f = p.flowMode; return { index: m.index, cur: f.currentDeck, trans: f._transitioning, a: p.decks.A.isPlaying, b: p.decks.B.isPlaying, xf: +document.getElementById('crossfader').value };`);
            if (state.index > info.index) break;
        }
        const after = await evalJs(`clearInterval(window.__lv); const p = window._djPlayer, m = p.djMixz, f = p.flowMode; const cur = p.decks[f.currentDeck];
            await new Promise(r => setTimeout(r, 1500));
            return { levels: window.__levels, title: cur.metadata?.metadata?.title, playing: cur.isPlaying, t: +cur.getCurrentTime().toFixed(1), rms: +window.__rms().toFixed(4), want: m.plan[m.index]?.track.title, now: document.querySelector('.djmixz-row.now .djmixz-name')?.innerText, errs: window.__errs };`);
        const quiet = after.levels.filter((v) => v < 0.0005).length;
        check(`handover ${n}: ${info.move.type}, ${info.move.bars} bars, deck ${info.from} to deck ${state.cur}`, state.index === info.index + 1 && state.cur !== info.from, `crossfader at ${state.xf}`);
        check(`handover ${n}: the planned next track is the one now playing`, after.playing && after.title === after.want, `"${after.title}" at ${after.t}s`);
        check(`handover ${n}: no dead air`, quiet <= 1 && after.rms > 0.001, `${after.levels.length} samples, ${quiet} silent, lowest ${Math.min(...after.levels)}`);
        return after;
    };
    const h1 = await handover(1);
    const h2 = await handover(2);
    check('no page errors during the set', (h2.errs || []).length === 0, (h2.errs || []).join(' ; '));

    // ── Takeover: a person grabs the decks, mixes one in by hand, then hands back ──
    const took = await evalJs(`
        const p = window._djPlayer, m = p.djMixz, f = p.flowMode;
        m.takeOver('button');
        const live = m._liveDeck(); const cur = p.decks[live];
        // run the playing deck into the zone where DJ MixZ would normally start its move
        cur.wavesurfer.setTime(Math.max(0, cur.getDuration() - f.transitionPoint - 1));
        await new Promise(r => setTimeout(r, 6000));
        return { human: m.human, live, trans: f._transitioning, bar: document.getElementById('djmixz-bar')?.innerText.replace(/\\s+/g, ' '), other: p.decks[live === 'A' ? 'B' : 'A'].isPlaying };`);
    check('TAKE OVER: DJ MixZ stands down and does not start its move', took.human && !took.trans && /YOU HAVE THE DECKS/.test(took.bar || ''), took.bar);

    const back = await evalJs(`
        const p = window._djPlayer, m = p.djMixz, f = p.flowMode;
        const from = m._liveDeck(); const to = from === 'A' ? 'B' : 'A';
        // the person mixes in a track of their own choosing: one DJ MixZ had planned for later
        const mine = m.plan[m.plan.length - 1].track;
        p.decks[to].isLoaded = false; p.library.loadToDeck(mine, to);
        for (let i = 0; i < 60 && !p.decks[to].isLoaded; i++) await new Promise(r => setTimeout(r, 500));
        p.decks[to].play();
        const xf = document.getElementById('crossfader'); xf.value = to === 'B' ? 100 : 0; p.audioRouter.setCrossfade(to === 'B' ? 1 : 0);
        p.decks[from].pause();
        await new Promise(r => setTimeout(r, 1500));
        m.handBack();
        return { human: m.human, live: m._liveDeck(), to, flowDeck: f.currentDeck, first: m.plan[0].track.title, mine: mine.title, planLen: m.plan.length, queue: f.queue.length, dup: m.plan.filter(x => x.track.title === mine.title).length, nextMove: m.plan[1]?.move?.type, bar: document.getElementById('djmixz-bar')?.innerText.replace(/\\s+/g, ' ') };`);
    check('HAND BACK: DJ MixZ picks up from the track the person left playing', !back.human && back.flowDeck === back.to && back.first === back.mine, `"${back.first}" on deck ${back.flowDeck}`);
    check('HAND BACK: the rest of the set is re-planned around it, with no repeat', back.dup === 1 && back.queue === back.planLen - 1 && !!back.nextMove && /DJ MIXZ IS MIXING/.test(back.bar || ''), `${back.planLen - 1} tracks left, next move ${back.nextMove}`);
    await handover(3);

    // ── Back to back: one track each ──
    const b2b = await evalJs(`
        const p = window._djPlayer, m = p.djMixz, f = p.flowMode;
        m.b2b = 1; m._turn = 0; m.battle = true; m.score = { ai: 0, human: 0 }; m.round = 1;
        return { b2b: m.b2b };`);
    await handover(4);
    const turn = await evalJs(`const p = window._djPlayer, m = p.djMixz; await new Promise(r => setTimeout(r, 800)); return { human: m.human, bar: document.getElementById('djmixz-bar')?.innerText.replace(/\\s+/g, ' ') };`);
    check('back to back: after its track, DJ MixZ hands the decks over on its own', b2b.b2b === 1 && turn.human, turn.bar);
    const myTurn = await evalJs(`
        const p = window._djPlayer, m = p.djMixz, f = p.flowMode;
        const from = m._liveDeck(); const to = from === 'A' ? 'B' : 'A';
        const mine = m.plan[m.plan.length - 1].track;
        p.decks[to].isLoaded = false; p.library.loadToDeck(mine, to);
        for (let i = 0; i < 60 && !p.decks[to].isLoaded; i++) await new Promise(r => setTimeout(r, 500));
        p.decks[to].play();
        const xf = document.getElementById('crossfader'); xf.value = to === 'B' ? 100 : 0; p.audioRouter.setCrossfade(to === 'B' ? 1 : 0);
        p.decks[from].pause();
        await new Promise(r => setTimeout(r, 2500));
        return { human: m.human, first: m.plan[0].track.title, mine: mine.title, flowDeck: f.currentDeck, to };`);
    check('back to back: once the person lands their mix, DJ MixZ takes the decks back', !myTurn.human && myTurn.first === myTurn.mine && myTurn.flowDeck === myTurn.to, `"${myTurn.first}"`);
    const contest = await evalJs(`const p = window._djPlayer, m = p.djMixz; const bar1 = document.getElementById('djmixz-bar')?.innerText.replace(/\s+/g, ' '); const open = m._voteOpen; document.querySelector('#djmixz-bar [data-act="vote-human"]')?.click(); return { open, bar1, score: m.score, round: m.round, closed: !m._voteOpen, bar2: document.getElementById('djmixz-bar')?.innerText.replace(/\s+/g, ' ') };`);
    check('contest: when both have played, the room is asked who took the round, and the point is scored', contest.open && /Who took round 1/.test(contest.bar1 || '') && contest.score.human === 1 && contest.score.ai === 0 && contest.round === 2 && contest.closed, contest.bar2);
    const errs = await evalJs('return window.__errs');
    check('no page errors during takeover and back to back', errs.length === 0, errs.join(' ; '));

    const stopped = await evalJs(`const p = window._djPlayer, m = p.djMixz, f = p.flowMode; m.stop(); return { running: m.running, restored: f._triggerTransition !== undefined && !document.getElementById('djmixz-open').classList.contains('live') };`);
    check('STOP gives the decks back', stopped.running === false && stopped.restored);
} catch (e) {
    console.log('FAIL  test run crashed:', e.message);
    failed += 1;
} finally {
    try { ws?.close(); } catch {}
    chrome.kill();
    await sleep(800);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
