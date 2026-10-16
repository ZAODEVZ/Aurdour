// node web/dj/MidiAsk.test.mjs
import { shouldAutoConnect, midiPermission, NOTE } from './MidiAsk.js';
let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };
console.log('MidiAsk');
check('connects by itself only once the browser said yes', shouldAutoConnect('granted') && !shouldAutoConnect('prompt') && !shouldAutoConnect('denied') && !shouldAutoConnect('unknown'));
check('reads the browser permission', (await midiPermission({ permissions: { query: async () => ({ state: 'granted' }) } })) === 'granted');
check('no permissions API means unknown, so no prompt', (await midiPermission({})) === 'unknown');
check('a browser that throws on midi means unknown', (await midiPermission({ permissions: { query: async () => { throw new Error('no'); } } })) === 'unknown');
check('the note says what it looks for, what it does not touch, and that later is fine', /DDJ-SB3/.test(NOTE.body) && /microphone or camera/.test(NOTE.body) && /any time/.test(NOTE.later));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
