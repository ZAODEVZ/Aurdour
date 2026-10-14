// node web/dj/FxFade.test.mjs
import { FX_FADES, fadePlan, fadeCurve, FxFade } from './FxFade.js';

let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };

console.log('FxFade');

check('eight pads, four kinds, short row then long row', FX_FADES.length === 8 && [0, 1, 2, 3].every(i => FX_FADES[i].type === FX_FADES[i + 4].type && FX_FADES[i].beats < FX_FADES[i + 4].beats));
check('4 beats at 120 BPM is 2 seconds', fadePlan(0, 120).seconds === 2);
check('8 beats at 100 BPM is 4.8 seconds', Math.abs(fadePlan(4, 100).seconds - 4.8) < 1e-9);
check('no BPM is treated as 120', fadePlan(0, null).seconds === 2 && fadePlan(0, 0).seconds === 2);
check('a very fast track never fades in under 0.4 s', fadePlan(3, 400).seconds === 0.4);
check('a very slow track never fades over 20 s', fadePlan(4, 10).seconds === 20);
check('high pass sweeps up, low pass sweeps down', fadePlan(0, 120).from < fadePlan(0, 120).to && fadePlan(1, 120).from > fadePlan(1, 120).to);
check('loop halves three times inside the fade', fadePlan(2, 120).halveAt.length === 3 && fadePlan(2, 120).halveAt.every(t => t > 0 && t < 2));
check('spin down slows the deck and fades from the start', fadePlan(3, 120).rateTo < 1 && fadePlan(3, 120).fadeFrom === 0);
check('a pad that does not exist gives nothing', fadePlan(8, 120) === null && fadePlan(-1, 120) === null);

// The runner, against stand-ins for the deck and the audio graph.
const param = (value) => ({ value, log: [], cancelScheduledValues() { this.log.push('cancel'); }, setValueAtTime(v, t) { this.log.push(['set', v, t]); this.value = v; }, linearRampToValueAtTime(v, t) { this.log.push(['lin', v, t]); }, setValueCurveAtTime(c, t, d) { this.log.push(['curve', c[0], c[c.length - 1], t, d]); }, exponentialRampToValueAtTime(v, t) { this.log.push(['exp', v, t]); } });
const rig = (o = {}) => {
    const ch = { channelGain: { gain: param(0.8) }, filter: { type: 'lowpass', frequency: param(20000), Q: { value: 0.707 } } };
    const deck = {
        isLoaded: true, isPlaying: true, currentRate: 1, keyLock: true, loop: { active: false }, calls: [],
        getBPM: () => 120, pause() { this.isPlaying = false; this.calls.push('pause'); },
        autoLoop(b) { this.loop.active = true; this.calls.push('autoLoop ' + b); }, loopHalve() { this.calls.push('halve'); },
        toggleLoop() { this.loop.active = !this.loop.active; this.calls.push('toggleLoop'); },
        wavesurfer: { setPlaybackRate: () => {} }, getMediaElement: () => deck.media, media: { preservesPitch: true }, ...o,
    };
    const applied = [];
    const dj = { decks: { A: deck }, audioRouter: { channels: { A: ch }, getAudioContext: () => ({ currentTime: 10, sampleRate: 48000 }), setChannelVolume: (d, v) => applied.push(`vol ${d} ${v}`), setFilter: (d, v) => applied.push(`filter ${d} ${v}`) } };
    return { fx: new FxFade(dj), deck, ch, dj, applied };
};

let r = rig();
check('a stopped deck ignores the pad', rig({ isPlaying: false }).fx.trigger('A', 0) === 'idle');
check('a playing deck starts the fade', r.fx.trigger('A', 0) === 'HIGH PASS' && r.fx.isActive('A'));
check('volume follows a curve from full to silence that ends with the fade', r.ch.channelGain.gain.log.some(e => e[0] === 'curve' && Math.abs(e[1] - 0.8) < 1e-6 && e[2] < 0.001 && Math.abs(e[3] + e[4] - 12) < 1e-9));
check('while the fade runs, the deck fader and filter are held off', r.dj.audioRouter._fxBusy.A === true);
check('filter becomes a high pass sweeping to 8 kHz', r.ch.filter.type === 'highpass' && r.ch.filter.frequency.log.some(e => e[0] === 'exp' && e[1] === 8000 && e[2] === 12));
check('a second press cancels', r.fx.trigger('A', 5) === 'cancelled' && !r.fx.isActive('A'));
check('cancel puts volume (in 60 ms, no click) and filter back and keeps playing', r.ch.channelGain.gain.log.some(e => e[0] === 'lin' && e[1] === 0.8) && r.ch.filter.type === 'lowpass' && r.ch.filter.frequency.value === 20000 && r.ch.filter.Q.value === 0.707 && r.deck.isPlaying);
check('after a cancel the fader and filter are free again', r.dj.audioRouter._fxBusy.A === false);

r = rig();
r.fx.trigger('A', 2);
check('loop fade starts a one beat loop', r.deck.calls.includes('autoLoop 1'));
r.fx._finish('A');
check('at the end the deck stops first, while it is still silent', !r.deck.isPlaying && r.fx.isActive('A'));
await new Promise(res => setTimeout(res, 200));
check('then the loop is released and the volume comes back', !r.deck.loop.active && r.ch.channelGain.gain.log.some(e => e[0] === 'lin' && e[1] === 0.8) && !r.fx.isActive('A'));

r = rig({ loop: { active: true } });
r.fx.trigger('A', 2); r.fx.cancel('A');
check('a loop the DJ already had running is left running', r.deck.loop.active);

r = rig();
r.fx.trigger('A', 3);
check('spin down turns key lock off for the slow down', r.deck.media.preservesPitch === false);
r.fx._finish('A');
await new Promise(res => setTimeout(res, 200));
check('after spin down key lock is back as it was', r.deck.media.preservesPitch === true);

r = rig();
r.fx.trigger('A', 0);
r.dj.audioRouter._fxPending = { A: { volume: 0.3, filter: 0.7 } };
r.fx.cancel('A');
await new Promise(res => setTimeout(res, 120));
check('a fader or filter moved during the fade is applied when it ends', r.applied.includes('vol A 0.3') && r.applied.includes('filter A 0.7'));
const c = fadeCurve(1);
check('the fade curve starts full, ends silent and only ever goes down', c[0] === 1 && c[c.length - 1] < 0.001 && [...c].every((v, i) => i === 0 || v <= c[i - 1]));
check('the curve stays above half volume for the first half (it does not drop out early)', c[Math.floor(c.length / 2) - 1] > 0.7);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
