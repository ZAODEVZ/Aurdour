// node pipeline/feedback_api.test.cjs
const { handle, clean, asText } = require('../api/feedback.js');

let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };

(async () => {
    console.log('feedback');
    const calls = [];
    const okFetch = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body), auth: opts.headers.authorization }); return { ok: true, status: 200 }; };
    const both = { FEEDBACK_TG_TOKEN: 'T', FEEDBACK_TG_CHAT: '42', FEEDBACK_GITHUB_TOKEN: 'G' };

    check('GET is refused', (await handle('GET', {}, both, okFetch))[0] === 405);
    check('an empty message is refused', (await handle('POST', { message: ' ' }, both, okFetch))[0] === 400);
    check('a bot filling the hidden field gets a quiet ok and sends nothing', (await handle('POST', { message: 'buy now', website: 'x' }, both, okFetch))[1].ok && calls.length === 0);
    const [st, js] = await handle('POST', { kind: 'Bug', message: 'Deck B skips\nsecond line', contact: '@zaal', nowPlaying: 'East vol 1' }, both, okFetch);
    check('a real message goes to Telegram and GitHub', st === 200 && js.sent.join() === 'telegram,github');
    check('Telegram gets the right chat', calls[0].url.endsWith('/botT/sendMessage') && calls[0].body.chat_id === '42');
    check('the GitHub issue is labelled feedback and titled from the first line', calls[1].body.labels[0] === 'feedback' && calls[1].body.title === 'Bug: Deck B skips' && calls[1].auth === 'Bearer G');
    check('nothing set means 501, so the page offers copy instead', (await handle('POST', { message: 'hello there' }, {}, okFetch))[0] === 501);
    const half = await handle('POST', { message: 'hello there' }, both, async (u) => (u.includes('telegram') ? { ok: false, status: 500 } : { ok: true }));
    check('one route failing still delivers through the other', half[0] === 200 && half[1].sent.join() === 'github');
    check('all routes failing is a 502', (await handle('POST', { message: 'hello there' }, both, async () => ({ ok: false, status: 500 })))[0] === 502);
    check('an unknown kind becomes Other', clean({ message: 'abc', kind: '<script>' }).kind === 'Other');
    check('long messages are cut to 2000', clean({ message: 'x'.repeat(5000) }).message.length === 2000);
    check('a JSON string body is read', (await handle('POST', JSON.stringify({ message: 'from a string' }), { FEEDBACK_GITHUB_TOKEN: 'G' }, okFetch))[0] === 200);
    check('the text names the sender or says none was given', /From: \(no name given\)/.test(asText(clean({ message: 'abc' }))));
    const flood = [];
    for (let i = 0; i < 7; i++) flood.push((await handle('POST', { message: 'spam spam' }, both, okFetch, '9.9.9.9'))[0]);
    check('one sender gets 5 an hour, then 429', flood.slice(0, 5).every((s) => s === 200) && flood[5] === 429 && flood[6] === 429);
    check('another sender still gets through', (await handle('POST', { message: 'hello there' }, both, okFetch, '8.8.8.8'))[0] === 200);

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})();
