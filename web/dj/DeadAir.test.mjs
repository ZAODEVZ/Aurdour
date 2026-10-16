// node web/dj/DeadAir.test.mjs
import { decide, SILENT_FOR_MS, COOLDOWN_MS, SILENT_RMS } from './DeadAir.js';

let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };

console.log('DeadAir');
check('five seconds, fifteen second cooldown, a quiet threshold', SILENT_FOR_MS === 5000 && COOLDOWN_MS === 15000 && SILENT_RMS > 0 && SILENT_RMS < 0.02);
check('off: never acts', decide({ on: false, silentMs: 60000, running: false, human: false }) === 'none');
check('under five seconds: waits', decide({ on: true, silentMs: 4900, running: false, human: false }) === 'none');
check('DJ MixZ off and quiet: starts a set', decide({ on: true, silentMs: 5001, running: false, human: false }) === 'start');
check('a person has the decks and went quiet: hands back to DJ MixZ', decide({ on: true, silentMs: 5001, running: true, human: true }) === 'handback');
check('DJ MixZ mixing but nothing comes out: skips to the next track', decide({ on: true, silentMs: 5001, running: true, human: false }) === 'skip');
check('a track still loading is not dead air', decide({ on: true, silentMs: 9000, running: true, human: false, loading: true }) === 'none');
check('audio engine asleep: nothing to do', decide({ on: true, silentMs: 9000, running: false, human: false, awake: false }) === 'none');
check('after acting it waits out the cooldown', decide({ on: true, silentMs: 9000, running: false, human: false, sinceAct: 3000 }) === 'none' && decide({ on: true, silentMs: 9000, running: false, human: false, sinceAct: 16000 }) === 'start');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
