// node web/dj/Moves.test.mjs — TRY A MOVE, the beat jump and slicer maths, and the PRO layout
import { MOVES, nextMove } from './Moves.js';
import { BEAT_JUMPS, jumpTarget, sliceTarget, PadModes } from './PadModes.js';
import { SECTIONS, openState } from './ProLayout.js';

let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };
const deck = (o = {}) => ({ loaded: true, playing: false, bpm: 120, cues: 0, loop: false, filtered: false, fading: false, ...o });
const state = (o = {}) => ({ A: deck(), B: deck(), crossfader: 0.5, matched: false, jumps: 0, slices: 0, mixzRunning: false, mixzHuman: false, ...o });
const move = id => MOVES.find(m => m.id === id);

console.log('Moves');
check('every move has an id, a line to say and a line for the win', MOVES.every(m => m.id && m.say && m.win && typeof m.done === 'function'));
check('ids are unique', new Set(MOVES.map(m => m.id)).size === MOVES.length);
check('every line is short enough to read at a glance (80 characters)', MOVES.every(m => m.say.length <= 80 && m.win.length <= 80));
check('no em dash in any line shown on screen', MOVES.every(m => !/—/.test(m.say + m.win)));
check('nothing is done on a fresh page', MOVES.every(m => !m.done(state({ A: deck({ loaded: false }), B: deck({ loaded: false }) }), {})));

check('nextMove starts at the first move', nextMove([]).id === MOVES[0].id);
check('nextMove skips what is done', nextMove([MOVES[0].id]).id === MOVES[1].id);
check('SKIP moves on to the one after', nextMove([], MOVES[0].id).id === MOVES[1].id);
check('SKIP on the last one wraps to the first', nextMove([], MOVES[MOVES.length - 1].id).id === MOVES[0].id);
check('nothing left gives null', nextMove(MOVES.map(m => m.id)) === null);

check('two tracks: needs both decks', move('two-tracks').done(state(), {}) && !move('two-tracks').done(state({ B: deck({ loaded: false }) }), {}));
let m = {};
const playing = { A: deck({ playing: true }), B: deck({ playing: true }) };
check('blend: one side is not enough', !move('blend').done(state({ ...playing, crossfader: 0.05 }), m));
check('blend: both sides while both play is a blend', move('blend').done(state({ ...playing, crossfader: 0.95 }), m));
check('blend: does not count with one deck stopped', !move('blend').done(state({ crossfader: 0.05 }), {}));
check('sync: matched tempos on two different tracks', move('sync').done(state({ matched: true, B: deck({ bpm: 126 }) }), {}) && !move('sync').done(state({ matched: true }), {}));
m = {};
check('hot cue: cues already there do not count', !move('hot-cue').done(state({ A: deck({ cues: 2 }) }), m));
check('hot cue: a new one does', move('hot-cue').done(state({ A: deck({ cues: 3 }) }), m));
m = {};
check('loop: still running is not done', !move('loop').done(state({ A: deck({ loop: true }) }), m));
check('loop: caught and let go is done', move('loop').done(state(), m));
m = {};
check('filter: swept and brought back', !move('filter').done(state({ A: deck({ playing: true, filtered: true }) }), m) && move('filter').done(state({ A: deck({ playing: true }) }), m));
m = {};
check('slicer: needs three slices, not one', !move('slicer').done(state({ slices: 4 }), m) && !move('slicer').done(state({ slices: 5 }), m) && move('slicer').done(state({ slices: 7 }), m));
m = {};
check('take over: DJ MixZ driving, then a person', !move('take-over').done(state({ mixzRunning: true }), m) && move('take-over').done(state({ mixzRunning: true, mixzHuman: true }), m));

console.log('PadModes');
check('top row jumps back, bottom row forward, by 1 2 4 8', BEAT_JUMPS.join() === '-1,-2,-4,-8,1,2,4,8');
check('4 beats forward at 120 BPM is 2 seconds', jumpTarget(10, 200, 120, 4) === 12);
check('a jump never leaves the track', jumpTarget(1, 200, 120, -8) === 0 && jumpTarget(199, 200, 120, 8) === 200);
check('no BPM, no jump', jumpTarget(10, 200, null, 4) === null);
check('slicer: pad 1 is the start of the 8 beat window', sliceTarget(5.3, 200, 120, 0) === 4);
check('slicer: pad 4 is three beats in', sliceTarget(5.3, 200, 120, 3) === 5.5);
check('slicer: a pad outside 1 to 8 gives nothing', sliceTarget(5, 200, 120, 8) === null);
const seeks = [];
const dj = { decks: { A: { isLoaded: true, getCurrentTime: () => 10, getDuration: () => 200, getBPM: () => 120, wavesurfer: { seekTo: f => seeks.push(f) } } } };
const pm = new PadModes(dj);
check('beat jump seeks and counts', pm.beatJump('A', 6) === 4 && Math.abs(seeks[0] - 12 / 200) < 1e-9 && pm.jumpCount === 1);
check('slice seeks and counts', pm.slice('A', 0) === 0 && Math.abs(seeks[1] - 8 / 200) < 1e-9 && pm.sliceCount === 1);
check('an empty deck ignores both', new PadModes({ decks: { A: { isLoaded: false } } }).beatJump('A', 0) === null);

console.log('ProLayout');
check('first visit: only the everyday blocks are open', openState(null)['loop-controls'] === true && openState(null)['fx-section'] === false && openState(null)['stems-section'] === false);
check('a saved choice wins over the default', openState({ 'fx-section': true, 'loop-controls': false })['fx-section'] === true && openState({ 'loop-controls': false })['loop-controls'] === false);
check('more blocks start folded than open', SECTIONS.filter(s => !s.open).length > SECTIONS.filter(s => s.open).length);
check('a broken saved value falls back to the default', openState({ 'fx-section': 'yes' })['fx-section'] === false);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
