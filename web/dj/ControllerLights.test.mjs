// node web/dj/ControllerLights.test.mjs
import { LIGHTS as L, lightsFor, allOff, beatAt, tempoMatched } from './ControllerLights.js';

let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };
const led = (map, status, note) => map.get((status << 8) | note);
const deck = (o = {}) => ({ loaded: true, playing: false, time: 0, duration: 200, bpm: 120, rate: 1, hotCues: new Array(8).fill(false), ...o });
const empty = () => deck({ loaded: false, bpm: null, duration: 0 });
const NA = 0x90, NB = 0x91, PA = 0x97, PB = 0x98;

console.log('ControllerLights');

// Nothing loaded
let m = lightsFor({ decks: { A: empty(), B: empty() } }, 0);
check('empty deck: play, cue and every pad dark', led(m, NA, L.NOTE_PLAY) === 0 && led(m, NA, L.NOTE_CUE) === 0 && [0, 1, 2, 3, 4, 5, 6, 7].every(i => led(m, PA, i) === 0));
check('allOff is all zeros', [...allOff().values()].every(v => v === 0));

// Loaded, parked
m = lightsFor({ decks: { A: deck(), B: empty() } }, 0);
check('loaded and parked: cue solid', led(m, NA, L.NOTE_CUE) === 127);
check('loaded and parked: play blinks (on at 0 ms, off at 500 ms)', led(m, NA, L.NOTE_PLAY) === 127 && led(lightsFor({ decks: { A: deck(), B: empty() } }, 500), NA, L.NOTE_PLAY) === 0);

// Playing
m = lightsFor({ decks: { A: deck({ playing: true, time: 10 }), B: empty() } }, 300);
check('playing: play solid', led(m, NA, L.NOTE_PLAY) === 127);
check('playing on the beat: cue lit', led(m, NA, L.NOTE_CUE) === 127);
m = lightsFor({ decks: { A: deck({ playing: true, time: 10.3 }), B: empty() } }, 300);
check('playing between beats: cue dark', led(m, NA, L.NOTE_CUE) === 0);
m = lightsFor({ decks: { A: deck({ playing: true, time: 10.3, bpm: null }), B: empty() } }, 300);
check('playing with no BPM: cue stays solid, no flicker', led(m, NA, L.NOTE_CUE) === 127);

// End of track warning
const near = (time, t) => led(lightsFor({ decks: { A: deck({ playing: true, time }), B: empty() } }, t), NA, L.NOTE_PLAY);
check('40 s left: no warning', near(160, 200) === 127 && near(160, 300) === 127);
check('20 s left: play flashes', near(180, 0) === 127 && near(180, 200) === 0);
check('5 s left: play flashes faster', near(195, 0) === 127 && near(195, 84) === 0);

// Hot cues on pads
const cues = [true, false, true, false, false, false, false, true];
m = lightsFor({ decks: { A: deck({ hotCues: cues }), B: deck() } }, 0);
check('pads show the hot cues that are set', cues.every((c, i) => led(m, PA, i) === (c ? 127 : 0)));
check('deck B pads go out on channel 8', [0, 1, 2, 3, 4, 5, 6, 7].every(i => led(m, PB, i) === 0));

// DJ MixZ driving: beat counter replaces hot cues on the playing deck
m = lightsFor({ decks: { A: deck({ playing: true, time: 1.6, hotCues: cues }), B: deck({ hotCues: cues }) }, mixz: { running: true, human: false } }, 0);
check('DJ MixZ driving: playing deck counts beats (beat 3 lights pad 4)', [0, 1, 2, 3, 4, 5, 6, 7].every(i => led(m, PA, i) === (i === 3 ? 127 : 0)));
check('DJ MixZ driving: the waiting deck keeps its hot cues', cues.every((c, i) => led(m, PB, i) === (c ? 127 : 0)));
m = lightsFor({ decks: { A: deck({ playing: true, time: 1.6, hotCues: cues }), B: deck() }, mixz: { running: true, human: true } }, 0);
check('a person took over: pads go back to hot cues', cues.every((c, i) => led(m, PA, i) === (c ? 127 : 0)));

// Sync, loop, toggles
check('tempoMatched: 120 against 126 at -4.76%', tempoMatched(deck(), deck({ bpm: 126, rate: 120 / 126 })));
check('tempoMatched: 120 against 126 unmatched', !tempoMatched(deck(), deck({ bpm: 126 })));
check('tempoMatched: needs both decks loaded', !tempoMatched(deck(), empty()));
m = lightsFor({ decks: { A: deck(), B: deck() } }, 0);
check('matched tempos light sync on both decks', led(m, NA, L.NOTE_SYNC) === 127 && led(m, NB, L.NOTE_SYNC) === 127);
m = lightsFor({ decks: { A: deck({ loopIn: true }), B: deck({ loopActive: true, playing: true, time: 10 }) } }, 0);
check('loop in set: in lit, out dark', led(m, NA, L.NOTE_LOOP_IN) === 127 && led(m, NA, L.NOTE_LOOP_OUT) === 0);
check('loop running: in and out lit, auto loop pulses', led(m, NB, L.NOTE_LOOP_IN) === 127 && led(m, NB, L.NOTE_LOOP_OUT) === 127 && led(m, NB, L.NOTE_AUTO_LOOP) === 127);
m = lightsFor({ decks: { A: deck({ pfl: true, keyLock: true, slip: true, fx: true }), B: deck() } }, 0);
check('headphone cue, key lock, slip and FX follow the app', [L.NOTE_PFL, L.NOTE_KEYLOCK, L.NOTE_SLIP, L.NOTE_FX].every(n => led(m, NA, n) === 127) && [L.NOTE_PFL, L.NOTE_SLIP, L.NOTE_FX].every(n => led(m, NB, n) === 0));

// Level meter
m = lightsFor({ decks: { A: deck({ playing: true, level: 0.5 }), B: deck({ level: 0.9 }) } }, 0);
check('level meter follows the playing deck', led(m, 0xB0, L.CC_LEVEL) === 64);
check('level meter is zero on a stopped deck', led(m, 0xB1, L.CC_LEVEL) === 0);
check('level meter never passes 127', led(lightsFor({ decks: { A: deck({ playing: true, level: 3 }), B: empty() } }, 0), 0xB0, L.CC_LEVEL) === 127);

// Hello sweep
const boot = t => lightsFor({ decks: { A: deck({ hotCues: cues }), B: deck() }, bootAt: 1000 }, 1000 + t);
check('hello sweep starts on deck A pad 1', led(boot(0), PA, 0) === 127 && led(boot(0), PB, 0) === 0);
check('hello sweep crosses to deck B', led(boot(L.BOOT_MS / 32 * 8 + 1), PB, 0) === 127 && led(boot(L.BOOT_MS / 32 * 8 + 1), PA, 0) === 0);
check('after the sweep the real state returns', cues.every((c, i) => led(boot(L.BOOT_MS + 1), PA, i) === (c ? 127 : 0)));

// Pad modes and FX FADE pads
m = lightsFor({ decks: { A: deck({ padMode: 'fxfade', playing: true }), B: deck() } }, 0);
check('the pad mode in use is the only mode button lit', led(m, NA, L.MODE_NOTES.fxfade) === 127 && led(m, NA, L.MODE_NOTES.hotcue) === 0 && led(m, NB, L.MODE_NOTES.hotcue) === 127);
check('FX FADE pads are lit on a playing deck and dark on a stopped one', [0, 1, 2, 3, 4, 5, 6, 7].every(i => led(m, PA, 0x10 + i) === 127 && led(m, PB, 0x10 + i) === 0));
m = lightsFor({ decks: { A: deck({ playing: true, fxFadePad: 2 }), B: deck() } }, 0);
check('a running fade flashes its own pad and darkens the rest', led(m, PA, 0x12) === 127 && [0, 1, 3, 4, 5, 6, 7].every(i => led(m, PA, 0x10 + i) === 0) && led(lightsFor({ decks: { A: deck({ playing: true, fxFadePad: 2 }), B: deck() } }, 100), PA, 0x12) === 0);

// Shape
check('every value is a valid MIDI data byte', [...lightsFor({ decks: { A: deck({ playing: true, level: 0.7 }), B: deck() } }, 123).values()].every(v => Number.isInteger(v) && v >= 0 && v <= 127));
check('beatAt: 120 BPM at 1.6 s is beat 3', beatAt({ bpm: 120, time: 1.6 }).index === 3);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
