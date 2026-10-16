// node web/dj/MidiAsk.test.mjs
import { shouldAutoConnect, midiPermission, NOTE, describeDevices } from './MidiAsk.js';
let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };
console.log('MidiAsk');
check('connects by itself only once the browser said yes', shouldAutoConnect('granted') && !shouldAutoConnect('prompt') && !shouldAutoConnect('denied') && !shouldAutoConnect('unknown'));
check('reads the browser permission', (await midiPermission({ permissions: { query: async () => ({ state: 'granted' }) } })) === 'granted');
check('no permissions API means unknown, so no prompt', (await midiPermission({})) === 'unknown');
check('a browser that throws on midi means unknown', (await midiPermission({ permissions: { query: async () => { throw new Error('no'); } } })) === 'unknown');
check('the note says what it looks for, what it does not touch, and that later is fine', /DDJ-SB3/.test(NOTE.body) && /microphone or camera/.test(NOTE.body) && /any time/.test(NOTE.later));
const ddj = (n) => /ddj/i.test(n);
const two = describeDevices(['PIONEER DDJ-SB3', 'MPK mini 3', 'MPK mini 3'], ddj);
check('found devices are listed once each', two.devices.length === 2 && two.title === 'Found 2 controllers');
check('a known controller reads ready', two.devices[0].ready && /ready/.test(two.lines[0]));
check('an unknown one is found and told to use LEARN', !two.devices[1].ready && /use LEARN/.test(two.lines[1]));
const none = describeDevices([], ddj);
check('nothing found says what to try, no drivers needed', none.title === 'No controller found' && /no driver/.test(none.lines.join(' ')));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
