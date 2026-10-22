// SoundBoard.js — the DJ's FX board: real samples (air horns, vocal drops, sweeps and hits) on
// pads, one tap away in manual mixing and while DJ MixZ runs the set. DJ MixZ draws from the
// same pads on its own (PartyFX asks the board first, its built-in sounds are the fallback).
// The pads come from data/fx/board.json, made by MixZ-Local/cut-fx.mjs from the DJ's packs:
//   { pads: [{ id, file, label, group: 'horn' | 'vocal' | 'fx', words, seconds }] }

export const GROUPS = [
    { id: 'horn', label: 'HORNS' },
    { id: 'vocal', label: 'DROPS' },
    { id: 'fx', label: 'FX' },
];

// The next pad from a group, never the same one twice running. Pure, for tests.
export function pickPad(pads, group, last = null, rnd = Math.random) {
    const pool = pads.filter((p) => p.group === group && p.id !== last);
    if (!pool.length) return pads.find((p) => p.group === group) || null;
    return pool[Math.floor(rnd() * pool.length)];
}

export class SoundBoard {
    constructor(dj) {
        this.dj = dj;
        this.pads = [];
        this.level = 1.0;
        this._buffers = {};
        this._playing = new Set();
        this._last = {};
        this.ready = this._load();
    }

    get ctx() { return this.dj.audioRouter?.getAudioContext?.() || this.dj.audioRouter?.ctx || null; }
    get out() { return this.dj.audioRouter?.masterGain || null; }

    has(group) { return this.pads.some((p) => p.group === group); }

    // A pad whose words match (a "pull up" for the rewind, say), or null
    find(re) { return this.pads.find((p) => re.test(`${p.label} ${p.words || ''}`)) || null; }

    async _load() {
        try {
            const r = await fetch('data/fx/board.json', { cache: 'no-store' });
            if (r.ok) this.pads = ((await r.json()).pads || []).filter((p) => p && p.id && p.file);
        } catch (e) { /* no board: the built-in sounds carry on */ }
        this._render();
        this.pads.forEach((p) => this._buffer(p).catch(() => {}));
    }

    async _buffer(pad) {
        if (this._buffers[pad.id]) return this._buffers[pad.id];
        const r = await fetch(`data/fx/${pad.file}`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`no sample ${pad.file}`);
        this._buffers[pad.id] = await this.ctx.decodeAudioData(await r.arrayBuffer());
        return this._buffers[pad.id];
    }

    // Play one pad into the master bus. `echo` sends it through the dub echo (MC drops).
    async play(id, { echo = false, level = this.level } = {}) {
        const ctx = this.ctx, pad = this.pads.find((p) => p.id === id);
        if (!ctx || !this.out || !pad) return false;
        try {
            const src = ctx.createBufferSource();
            src.buffer = await this._buffer(pad);
            const g = ctx.createGain(); g.gain.value = level;
            src.connect(g);
            if (echo && this.dj.partyFX?._dub) this.dj.partyFX._dub(g, 0.3, 0.35); else g.connect(this.out);
            this._playing.add(src);
            src.onended = () => { this._playing.delete(src); try { g.disconnect(); } catch (e) { /* gone */ } };
            src.start();
            this._flash(id);
            return true;
        } catch (e) { console.warn('[SoundBoard] pad failed:', e.message); return false; }
    }

    stopAll() { for (const s of this._playing) { try { s.stop(); } catch (e) { /* done */ } } this._playing.clear(); }

    // Fire one from a group (what DJ MixZ calls). Returns the pad, or null when the board has none.
    fire(group, opts) {
        const pad = pickPad(this.pads, group, this._last[group]);
        if (!pad) return null;
        this._last[group] = pad.id;
        this.play(pad.id, opts);
        return pad;
    }

    _flash(id) {
        const b = document.querySelector(`#fxboard [data-pad="${id}"]`);
        if (!b) return;
        b.classList.add('hit');
        setTimeout(() => b.classList.remove('hit'), 220);
    }

    _render() {
        if (typeof document === 'undefined' || document.getElementById('fxboard')) return;
        const open = document.createElement('button');
        open.className = 'btn-toolbar btn-sm btn-fxboard';
        open.id = 'fxboard-open';
        open.textContent = 'FX BOARD';
        open.title = this.pads.length ? `${this.pads.length} samples: horns, drops and FX, one tap each` : 'No samples yet: drop packs in with MixZ-Local/cut-fx.mjs';
        const anchor = document.getElementById('library-open');
        if (anchor) anchor.insertAdjacentElement('beforebegin', open);
        else document.querySelector('.toolbar-group')?.appendChild(open);

        const panel = document.createElement('div');
        panel.id = 'fxboard';
        panel.className = 'fxboard hidden';
        const groups = GROUPS.filter((g) => this.has(g.id)).map((g) => `
            <div class="fxboard-group fxboard-${g.id}">
                <div class="fxboard-label">${g.label}</div>
                <div class="fxboard-pads">${this.pads.filter((p) => p.group === g.id).map((p) => `<button type="button" data-pad="${p.id}" title="${(p.words || p.label).replace(/"/g, '&quot;')} (${p.seconds || '?'}s)">${p.label}</button>`).join('')}</div>
            </div>`).join('');
        panel.innerHTML = `
            <div class="fxboard-head">
                <div><div class="fxboard-title">FX BOARD</div><div class="fxboard-sub">${this.pads.length ? 'Tap a pad. It goes out on the master, Space included.' : 'No samples on this build yet.'}</div></div>
                <button class="btn-mini" id="fxboard-stop" title="Cut every sample now">STOP</button>
                <button class="btn-mini" id="fxboard-close" aria-label="Close">X</button>
            </div>
            ${groups || '<div class="fxboard-empty">Run <code>node MixZ-Local/cut-fx.mjs</code> on your packs, then reload.</div>'}`;
        document.body.appendChild(panel);
        open.addEventListener('click', () => panel.classList.toggle('hidden'));
        panel.querySelector('#fxboard-close').addEventListener('click', () => panel.classList.add('hidden'));
        panel.querySelector('#fxboard-stop').addEventListener('click', () => this.stopAll());
        panel.addEventListener('click', (e) => {
            const id = e.target.closest('[data-pad]')?.dataset.pad;
            if (id) this.play(id, { echo: this.pads.find((p) => p.id === id)?.group === 'vocal' });
        });
    }
}
