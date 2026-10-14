// TestList.js — what to test, and feedback, right in the app
//
// TEST in the top bar opens a list of the things to try in this round. Each one takes a
// tick or a cross and a note. SEND copies a short report for Telegram and opens a GitHub
// issue with the same text, so nothing is typed twice. The list and the answers stay on
// this device until a new round replaces them.
//
// report() is pure and runs under node: see TestList.test.mjs.

export const ROUND = { id: '2026-10-14b', title: 'Phone stream, title first, mix link', date: '14 Oct 2026' };

export const ITEMS = [
    { g: 'The decks', id: 'title', t: 'Titles read clean: no "Artist -" in front, long ones wrap to two lines, nothing cut to "..."' },
    { g: 'The decks', id: 'onair', t: 'ON AIR sits on the deck the room hears and follows the crossfader' },
    { g: 'The decks', id: 'np', t: 'The NOW PLAYING bar under the top shows the right song; OPEN THE SONG opens it' },
    { g: 'The decks', id: 'library', t: 'LIBRARY opens the library over the decks; Esc or CLOSE puts it back' },
    { g: 'The mix link', id: 'share', t: 'SHARE THE MIX copies a link; the link opens and lists the songs in order with the times' },
    { g: 'The mix link', id: 'relisten', t: 'On that page PLAY THE MIX plays the songs one after the other; each song link goes to the right place' },
    { g: 'The controller', id: 'fxfade', t: 'FX FADE pads on the SB3: each of the 8 fades sounds right, no drop out, no pop' },
    { g: 'The controller', id: 'lights', t: 'LIGHTS ON and DECK AUDIO: pads light up, sound comes out of the SB3' },
    { g: 'The phone', id: 'link', t: 'Scan the QR, ALLOW once at the desk, taps and sliders land straight away, the ms shows' },
    { g: 'The phone', id: 'listen', t: 'LISTEN on mobile data, away from the PC: says LIVE MIX or PLAY ALONG, sound within ten seconds' },
    { g: 'The phone', id: 'stream', t: 'STREAM tab: START THE STREAM builds a set and the desk plays it; SKIP TRACK, GO LIVE, STOP work' },
    { g: 'The phone', id: 'endless', t: 'ENDLESS on: when the set ends the desk builds the next one and keeps playing' },
    { g: 'The phone', id: 'ptracks', t: 'TRACKS tab: SONGCHAINN, ZAO CRATE and ON THE DESK list songs; load to A or B works' },
    { g: 'The phone', id: 'pshare', t: 'SHARE THE MIX on the phone shows the link, COPY and SEND work' },
    { g: 'DJ MixZ', id: 'mixz', t: 'MIX SONGCHAINN NOW plays a set; touching the controller takes over; HAND BACK returns it' },
    { g: 'Install', id: 'install', t: 'INSTALL puts the app on the PC and the phone; it opens without the browser bar' },
];

// The report text, for Telegram and the GitHub issue. state: { [id]: { ok: true|false|null, note } }
export function report(items, state, { round = ROUND, extra = '', device = '' } = {}) {
    const lines = [`MixZ test: ${round.title} (${round.date})`];
    if (device) lines.push(`On: ${device}`);
    let ok = 0, bad = 0, skipped = 0;
    let group = '';
    for (const it of items) {
        const s = state?.[it.id] || {};
        if (it.g !== group) { group = it.g; lines.push('', group.toUpperCase()); }
        const mark = s.ok === true ? 'OK ' : s.ok === false ? 'NO ' : '-- ';
        if (s.ok === true) ok += 1; else if (s.ok === false) bad += 1; else skipped += 1;
        const note = String(s.note || '').trim();
        lines.push(`${mark}${it.t}${note ? `  >> ${note}` : ''}`);
    }
    if (String(extra || '').trim()) lines.push('', 'ALSO', String(extra).trim());
    lines.push('', `${ok} ok, ${bad} not ok, ${skipped} not tried`);
    return lines.join('\n');
}

export const issueUrl = (repo, title, body) => `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;

const KEY = `mixz-test-${ROUND.id}`;
const REPO = 'bettercallzaal/ZAOMixZ';

export class TestList {
    constructor(dj) {
        this.dj = dj;
        this.state = {};
        try { this.state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { this.state = {}; }
        this._build();
    }

    _save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { /* no storage */ } }

    _device() {
        const ua = navigator.userAgent;
        const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'other';
        const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'browser';
        const ctl = this.dj?.midi?.activeProfile ? `, controller ${this.dj.midi.activeProfile}` : '';
        return `${os}, ${br}${ctl}`;
    }

    _build() {
        const btn = document.getElementById('test-open');
        if (!btn || document.getElementById('test-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'test-panel';
        panel.className = 'test-panel hidden';
        const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        let group = '';
        let rows = '';
        for (const it of ITEMS) {
            if (it.g !== group) { group = it.g; rows += `<div class="test-group">${esc(group)}</div>`; }
            rows += `<div class="test-row" data-id="${it.id}">
                <div class="test-text">${esc(it.t)}</div>
                <div class="test-marks"><button class="test-mark ok" data-ok="1" title="Works">OK</button><button class="test-mark bad" data-ok="0" title="Does not work">NO</button></div>
                <input class="test-note" placeholder="What you saw (optional)" maxlength="300">
            </div>`;
        }
        panel.innerHTML = `
            <div class="test-head">
                <div><div class="test-title">Test this round</div><div class="test-sub">${esc(ROUND.title)} · ${esc(ROUND.date)}. Tap OK or NO on each, add a note where it helps, then SEND.</div></div>
                <button class="btn-mini" id="test-close" aria-label="Close">X</button>
            </div>
            <div class="test-list">${rows}</div>
            <textarea class="test-extra" id="test-extra" placeholder="Anything else: ideas, what felt off, what you want next" maxlength="2000"></textarea>
            <div class="test-actions">
                <button class="btn-toolbar" id="test-copy">COPY FOR TELEGRAM</button>
                <button class="btn-toolbar test-send" id="test-send">SEND AS GITHUB ISSUE</button>
                <button class="btn-toolbar btn-sm" id="test-reset">CLEAR</button>
            </div>
            <div class="test-say" id="test-say"></div>`;
        document.body.appendChild(panel);
        this.panel = panel;
        btn.addEventListener('click', () => { panel.classList.toggle('hidden'); this._paint(); });
        panel.querySelector('#test-close').addEventListener('click', () => panel.classList.add('hidden'));
        panel.addEventListener('click', (e) => {
            const m = e.target.closest('.test-mark');
            if (!m) return;
            const id = m.closest('.test-row').dataset.id;
            const want = m.dataset.ok === '1';
            const cur = this.state[id]?.ok;
            this.state[id] = { ...(this.state[id] || {}), ok: cur === want ? null : want };
            this._save(); this._paint();
        });
        panel.addEventListener('input', (e) => {
            const n = e.target.closest('.test-note');
            if (!n) return;
            const id = n.closest('.test-row').dataset.id;
            this.state[id] = { ...(this.state[id] || {}), note: n.value };
            this._save();
        });
        panel.querySelector('#test-extra').addEventListener('input', (e) => { this.state._extra = e.target.value; this._save(); });
        panel.querySelector('#test-copy').addEventListener('click', async () => {
            const text = this._report();
            try { await navigator.clipboard.writeText(text); this._say('Copied. Paste it to IMan on Telegram.'); } catch (e) { this._say('Could not copy here. Use SEND AS GITHUB ISSUE.'); }
        });
        panel.querySelector('#test-send').addEventListener('click', () => {
            const text = this._report();
            const bad = ITEMS.filter((it) => this.state[it.id]?.ok === false).length;
            const title = `Test round ${ROUND.date}: ${bad ? `${bad} not ok` : 'all ok'}`;
            window.open(issueUrl(REPO, title, text), '_blank', 'noopener');
            this._say('GitHub opened with the report filled in. Press Submit there.');
        });
        panel.querySelector('#test-reset').addEventListener('click', () => { this.state = {}; this._save(); this._paint(); this._say('Cleared.'); });
        this._paint();
    }

    _report() { return report(ITEMS, this.state, { extra: this.state._extra || '', device: this._device() }); }

    _say(text) { const el = this.panel?.querySelector('#test-say'); if (el) el.textContent = text; }

    _paint() {
        if (!this.panel) return;
        let ok = 0, bad = 0;
        for (const row of this.panel.querySelectorAll('.test-row')) {
            const s = this.state[row.dataset.id] || {};
            row.classList.toggle('is-ok', s.ok === true);
            row.classList.toggle('is-bad', s.ok === false);
            row.querySelector('[data-ok="1"]').classList.toggle('on', s.ok === true);
            row.querySelector('[data-ok="0"]').classList.toggle('on', s.ok === false);
            const note = row.querySelector('.test-note');
            if (note.value !== (s.note || '')) note.value = s.note || '';
            if (s.ok === true) ok += 1; else if (s.ok === false) bad += 1;
        }
        const extra = this.panel.querySelector('#test-extra');
        if (extra.value !== (this.state._extra || '')) extra.value = this.state._extra || '';
        const btn = document.getElementById('test-open');
        if (btn) { btn.textContent = ok + bad ? `TEST ${ok + bad}/${ITEMS.length}` : 'TEST'; btn.classList.toggle('has-bad', bad > 0); }
    }
}
