// node web/dj/Install.test.mjs
import { installPlan } from './Install.js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let failed = 0, passed = 0;
const check = (label, cond) => { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`); };
const web = join(dirname(fileURLToPath(import.meta.url)), '..');

const UA = {
    chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
    chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1',
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    firefoxWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
    firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0',
};
const plan = (ua, o = {}) => installPlan({ ua: UA[ua], standalone: false, canPrompt: false, maxTouchPoints: 0, ...o });

console.log('Install');
check('already running as an installed app: no button', Object.keys(UA).every(k => plan(k, { standalone: true }).show === false));
check('Windows, Mac and Android with the browser ready: one click install', ['chromeWin', 'edgeWin', 'chromeMac', 'chromeAndroid'].every(k => plan(k, { canPrompt: true }).mode === 'prompt'));
check('iPhone in Safari: Share, then Add to Home Screen', plan('safariIphone').mode === 'steps' && /Share/.test(plan('safariIphone').steps[0]) && /Add to Home Screen/.test(plan('safariIphone').steps[1]));
check('iPhone in Chrome: same route, with a way out if it is missing', plan('chromeIphone').mode === 'steps' && /Safari/.test(plan('chromeIphone').steps.join(' ')));
check('an iPad that says it is a Mac is still treated as an iPad', installPlan({ ua: UA.safariMac, maxTouchPoints: 5 }).title.includes('Home Screen'));
check('Safari on a Mac: File, then Add to Dock', plan('safariMac').title.includes('Dock') && /File/.test(plan('safariMac').steps[0]));
check('Firefox on a computer is told the truth: it cannot, use Chrome or Edge', /cannot/.test(plan('firefoxWin').steps[0]) && /Chrome or Edge/.test(plan('firefoxWin').steps[1]));
check('Firefox on Android has its own menu route', plan('firefoxAndroid').mode === 'steps' && /three dots/.test(plan('firefoxAndroid').steps[0]));
check('Chrome and Edge without the box ready still get menu steps', plan('chromeWin').mode === 'steps' && plan('edgeWin').steps.some(s => /Apps/.test(s)) && plan('chromeAndroid').steps.some(s => /Install app/.test(s)));
check('an unknown browser gets no button, not wrong steps', installPlan({ ua: 'SomethingElse/1.0' }).show === false);
check('the app name is used in the title', installPlan({ ua: UA.chromeWin, canPrompt: true }, 'ZAO MixZ Remote').title === 'Install ZAO MixZ Remote');
check('no em dash in anything shown', Object.keys(UA).every(k => !/—/.test(plan(k).title + plan(k).steps.join(' '))));

// The files a browser needs before it will offer to install
for (const [file, start] of [['manifest.webmanifest', '/'], ['remote.webmanifest', '/remote.html']]) {
    const m = JSON.parse(readFileSync(join(web, file), 'utf8'));
    const png = m.icons.filter(i => i.type === 'image/png');
    check(`${file}: name, start page and standalone display`, !!m.name && !!m.short_name && m.start_url === start && m.display === 'standalone' && !!m.id);
    check(`${file}: a 192 and a 512 PNG icon, and a maskable one`, png.some(i => i.sizes === '192x192') && png.some(i => i.sizes === '512x512') && m.icons.some(i => /maskable/.test(i.purpose || '')));
    check(`${file}: every icon file is really there`, png.every(i => existsSync(join(web, i.src))));
    check(`${file}: no em dash in the name`, !/—/.test(m.name + m.description));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
