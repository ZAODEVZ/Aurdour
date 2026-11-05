// node web/dj/RequestLine.test.mjs
import { cleanRequest, RequestQueue, songKey, forCaller, statusLine, canTape, autoPick, PER_PHONE, MAX_WAITING, NAME_MAX, NOTE_MAX, SUGGEST_MAX, SUGGEST_PER_USER } from './RequestLine.js';

let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };

const song = (title, artist = 'IMan Afrikah') => ({ id: `${artist}-${title}`, title, artist });
let clock = 1000;
const fresh = () => new RequestQueue({ now: () => clock++ });

console.log('RequestLine: what a phone may send');
check('needs a track id', cleanRequest({ name: 'Zaal' }) === null && cleanRequest(null) === null && cleanRequest({ track: 5 }) === null);
check('a long id is dropped', cleanRequest({ track: 'x'.repeat(201) }) === null);
const r = cleanRequest({ track: 'a', name: '  Zaal\n\tB  ', note: 'for the ZAO fam' });
check('name and note made one clean line', r.name === 'Zaal B' && r.note === 'for the ZAO fam');
check('no name: "A listener"', cleanRequest({ track: 'a' }).name === 'A listener');
check('name and note are cut short', cleanRequest({ track: 'a', name: 'n'.repeat(99), note: 'm'.repeat(999) }).name.length === NAME_MAX && cleanRequest({ track: 'a', note: 'm'.repeat(999) }).note.length === NOTE_MAX);

console.log('RequestLine: the board');
let q = fresh();
const first = q.add('phone1', cleanRequest({ track: 'x', name: 'Tom', note: 'for Attabotty' }), song('TAKE OVER'));
check('a request goes on the board, waiting', first.ok && first.request.status === 'waiting' && q.waiting().length === 1);
check('the same phone cannot ask for the same song twice', !q.add('phone1', cleanRequest({ track: 'x', name: 'Tom' }), song('TAKE OVER')).ok);
const join = q.add('phone2', cleanRequest({ track: 'x', name: 'Zaal' }), song('TAKE OVER'));
check('a second caller for the same song joins it, one request', join.ok && join.joined && q.waiting().length === 1 && first.request.also[0] === 'Zaal');
q.add('phone1', cleanRequest({ track: 'y', name: 'Tom' }), song('Lusaka Nights'));
check(`one phone has at most ${PER_PHONE} waiting`, !q.add('phone1', cleanRequest({ track: 'z', name: 'Tom' }), song('Third')).ok);
q = fresh();
for (let i = 0; i < MAX_WAITING; i++) q.add(`p${i}`, cleanRequest({ track: `s${i}` }), song(`Song ${i}`));
check(`the board holds ${MAX_WAITING}, then says it is full`, !q.add('late', cleanRequest({ track: 'late' }), song('Late')).ok);

console.log('RequestLine: on air');
q = fresh();
const a = q.add('p1', cleanRequest({ track: 'a', name: 'Tom' }), song('TAKE OVER', 'N3M3SIS x IMan Afrikah')).request;
const b = q.add('p2', cleanRequest({ track: 'b', name: 'Zaal' }), song('Lusaka Nights')).request;
check('the oldest waiting request comes first', q.first() === a);
q.set(b.rid, 'next');
check('the one marked next leads the board', q.board().up[0].rid === b.rid && q.board().count === 2);
let changed = q.nowPlaying('Lusaka Nights', 'IMan Afrikah');
check('when the desk plays it, it goes on air and its caller is told', changed.length === 1 && changed[0] === b && b.status === 'onair' && q.board().onair.rid === b.rid);
check('the deck title with the artist in front still matches', songKey('IMan Afrikah - Lusaka Nights.mp3', 'IMan Afrikah') === songKey('Lusaka Nights', 'IMan Afrikah'));
changed = q.nowPlaying('Something else', 'Jango UU');
check('when the song changes, it is played', changed.length === 1 && b.status === 'played' && !q.board().onair);
check('nothing playing changes nothing that waits', q.nowPlaying('', '').length === 0 && a.status === 'waiting');
check('a pass takes it off the board', q.set(a.rid, 'passed').status === 'passed' && q.waiting().length === 0);
check('an unknown status is refused', q.set(a.rid, 'lost') === null);

console.log('RequestLine: the caller');
q = fresh();
const mine = q.add('p1', cleanRequest({ track: 'a', name: 'Tom' }), song('TAKE OVER')).request;
q.add('p2', cleanRequest({ track: 'a', name: 'Zaal' }), song('TAKE OVER'));
check('the caller sees their own request', forCaller(q, 'p1').length === 1 && forCaller(q, 'p1')[0].mine);
check('a caller who joined sees it too, not as theirs', forCaller(q, 'p2').length === 1 && !forCaller(q, 'p2')[0].mine);
mine.tape = true;
check('the caller is told whether they can tape it', forCaller(q, 'p1')[0].tape === true && forCaller(q, 'p2')[0].tape === true);
check('another phone sees nothing of theirs', forCaller(q, 'p3').length === 0);
q.set(mine.rid, 'passed');
check('a passed request leaves the caller list', forCaller(q, 'p1').length === 0);
check('every status has words', ['waiting', 'next', 'onair', 'played', 'passed'].every((s) => statusLine(s).length > 0));

console.log('RequestLine: taping');
check('tape only when the licence allows radio', canTape({ uses: { radio: true } }) && !canTape({ uses: { radio: false } }) && !canTape(null));

console.log('RequestLine: a request goes on air only with a tap, or with AUTO-PLAY on');
{
    const q = fresh();
    q.add('p1', { name: 'Ana' }, song('Rude Boy'));
    const run = { running: true, human: false };
    check('AUTO-PLAY off (the default): nothing slots itself in', autoPick(q, run) === null && autoPick(q, { ...run, on: false }) === null);
    check('AUTO-PLAY on: the oldest waiting request is picked', autoPick(q, { ...run, on: true })?.title === 'Rude Boy');
    check('never while a person has the decks, or DJ MixZ is off', autoPick(q, { on: true, running: true, human: true }) === null && autoPick(q, { on: true, running: false }) === null);
    const agent = fresh();
    const r = agent.add('bot', { name: 'Bot' }, song('From A Bot')).request; r.from = 'agent';
    check('a request from an outside agent never plays by itself, switch or not', autoPick(agent, { ...run, on: true }) === null);
    const chat = fresh();
    chat.add('chat:twitch:ana', { name: 'Ana' }, song('From Chat')).request.from = 'chat';
    check('a request from stream chat never plays by itself either', autoPick(chat, { ...run, on: true }) === null);
    q.set(q.first().rid, 'next');
    q.add('p2', { name: 'Bo' }, song('Second'));
    check('only one request lined up next at a time', autoPick(q, { ...run, on: true }) === null);
}

console.log('RequestLine: songs suggested by a link to another site');
{
    const q = fresh();
    const yt = (n) => ({ kind: 'suggest', site: 'YouTube', host: 'www.youtube.com', title: '', key: `www.youtube.com/watch${n}` });
    const res = q.suggest('chat:twitch:ana', 'Ana', yt(1));
    check('a suggestion keeps who and where, and is open', res.ok && res.suggestion.name === 'Ana' && res.suggestion.host === 'www.youtube.com' && q.openSuggestions().length === 1);
    check('a suggestion is never a request: not waiting, not on the board, never picked', q.waiting().length === 0 && q.board().count === 0 && q.first() === null
        && autoPick(q, { on: true, running: true }) === null);
    check(`one waiting suggestion per chat user (${SUGGEST_PER_USER})`, !q.suggest('chat:twitch:ana', 'Ana', yt(2)).ok);
    check('the same link twice is one suggestion', !q.suggest('chat:twitch:bo', 'Bo', yt(1)).ok);
    for (let i = 0; i < SUGGEST_MAX + 3; i++) q.suggest(`chat:twitch:u${i}`, `U${i}`, yt(100 + i));
    check(`at most ${SUGGEST_MAX} suggestions wait at once`, q.openSuggestions().length === SUGGEST_MAX);
    const s = q.openSuggestions()[0];
    check('NOT TONIGHT waves one off', q.dismiss(s.sid)?.status === 'dismissed' && !q.openSuggestions().includes(s) && q.dismiss('nope') === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
