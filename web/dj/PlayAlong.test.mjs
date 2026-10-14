// node web/dj/PlayAlong.test.mjs
import { deckGains, drift, SEEK_IF_OFF_BY, PlayAlong } from './PlayAlong.js';

let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };
const near = (a, b) => Math.abs(a - b) < 0.001;

console.log('PlayAlong');
check('crossfader hard left: only A', near(deckGains(0).A, 1) && near(deckGains(0).B, 0));
check('crossfader hard right: only B', near(deckGains(1).A, 0) && near(deckGains(1).B, 1));
check('in the middle both sit at 0.707, so the level does not dip', near(deckGains(0.5).A, Math.SQRT1_2) && near(deckGains(0.5).B, Math.SQRT1_2));
check('deck faders and master scale it', near(deckGains(0, 0.5, 1, 0.5).A, 0.25) && near(deckGains(1, 1, 0.2, 1).B, 0.2));
check('rubbish is clamped', near(deckGains(7, 3, -1, 2).A, 0) && near(deckGains(7, 3, -1, 2).B, 0) && near(deckGains('x').A, 1));
check('drift allows for half the round trip', near(drift(10, 10, 400), 0.2) && near(drift(10.5, 10, 0), -0.5));
check('the seek threshold is a third of a second or so', SEEK_IF_OFF_BY > 0.2 && SEEK_IF_OFF_BY < 0.6);

// The engine against pretend audio elements
const mkEl = () => ({ paused: true, readyState: 2, currentTime: 0, playbackRate: 1, volume: 1, dataset: {}, calls: [], error: null,
    play() { this.paused = false; this.calls.push('play'); return Promise.resolve(); }, pause() { this.paused = true; this.calls.push('pause'); }, load() { this.calls.push('load'); }, removeAttribute() { this.src = ''; } });
globalThis.window = {};
const els = { A: mkEl(), B: mkEl() };
const pa = new PlayAlong({ elements: els, origin: 'https://zaomixz.vercel.app/' });
check('a shipped file is reached on the site, a full URL is used as is', pa.urlFor({ url: 'music/iman-afrikah/east-vol-1.mp3' }) === 'https://zaomixz.vercel.app/music/iman-afrikah/east-vol-1.mp3' && pa.urlFor({ url: 'https://pub.r2.dev/a.mp3' }) === 'https://pub.r2.dev/a.mp3' && pa.urlFor({}) === '');
pa.start();
check('starting without WebAudio falls back to element volume', pa.on && pa.ctx === null);
const state = { xf: 0, vol: { A: 1, B: 1 }, master: 1, A: { loaded: true, playing: true, url: 'https://x/a.mp3', time: 30, rate: 1 }, B: { loaded: false } };
pa.update(state, 200);
check('deck A gets its song and plays', els.A.src === 'https://x/a.mp3' && els.A.calls.includes('load') && !els.A.paused);
check('deck A is put at the desk position plus half the round trip', near(els.A.currentTime, 30.1));
check('deck B stays quiet', !els.B.src && els.B.paused);
els.A.currentTime = 30.2;
pa.update({ ...state, A: { ...state.A, time: 30.3 } }, 200);
check('a small drift is left alone (no stutter)', near(els.A.currentTime, 30.2));
pa.update({ ...state, A: { ...state.A, time: 45 } }, 0);
check('a jump on the desk is followed', near(els.A.currentTime, 45));
pa.update({ ...state, A: { ...state.A, playing: false } }, 0);
check('pause on the desk pauses the phone', els.A.paused);
pa.update({ ...state, xf: 1, A: { ...state.A, playing: true, rate: 1.04 } }, 0);
check('the crossfader and tempo reach the phone', near(els.A.volume, 0) && near(els.A.playbackRate, 1.04) && !els.A.paused);
pa.update({ ...state, A: { loaded: true, playing: true, time: 1, url: '' } }, 0);
check('a song only the desk has is named, not played', pa.say.includes('A: only on the desk') && els.A.paused);
pa.stop();
check('stop clears both decks', !pa.on && els.A.paused && els.B.paused && els.A.dataset.url === '');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
