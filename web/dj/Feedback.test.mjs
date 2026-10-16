// node web/dj/Feedback.test.mjs
import { onAir, feedbackUrl } from './Feedback.js';
let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };
const deck = (title, artist, isPlaying) => ({ isPlaying, metadata: { metadata: { title, artist } } });
console.log('Feedback');
check('the playing deck is on air', onAir({ A: deck('East vol 1', 'IMan Afrikah', true), B: deck('X', '', false) }) === 'IMan Afrikah - East vol 1');
check('both playing: the side the crossfader favours wins', onAir({ A: deck('a', '', true), B: deck('b', '', true) }, 0.9) === 'b');
check('nothing playing, nothing on air', onAir({ A: deck('a', '', false) }) === '' && onAir() === '');
check('the link carries the song', feedbackUrl('A & B') === '/feedback?now=A%20%26%20B');
check('no song, plain link', feedbackUrl('') === '/feedback');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
