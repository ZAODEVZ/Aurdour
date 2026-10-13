// ProLayout.js — keeps PRO mode in order
// PRO used to show every control at once. Now the top bar tools sit in a few named menus,
// and each block of deck and mixer tools has a title bar that folds it away. What is open
// is remembered, and both decks always fold together so they stay a mirror of each other.

// Deck and mixer blocks, by class name. open: shown the first time PRO is switched on.
export const SECTIONS = [
    { cls: 'pitch-row', title: 'TEMPO', open: true },
    { cls: 'loop-controls', title: 'LOOPS', open: true },
    { cls: 'hot-cue-pads', title: 'HOT CUES', open: true },
    { cls: 'fx-section', title: 'FX', open: false },
    { cls: 'beat-jump-btns', title: 'BEAT JUMP', open: false },
    { cls: 'key-shift-section', title: 'KEY', open: false },
    { cls: 'stems-section', title: 'STEMS', open: false },
    { cls: 'grid-toggle-row', title: 'BEAT GRID', open: false },
    { cls: 'phase-section', title: 'PHASE', open: false },
    { cls: 'mixer-tools-section', title: 'FADER TOOLS', open: false },
    { cls: 'headphone-section', title: 'HEADPHONES', open: true },
];

const KEY = 'mixz-pro-open';

// Which blocks are open: the saved choice where there is one, the default otherwise.
export function openState(saved, sections = SECTIONS) {
    const out = {};
    for (const s of sections) out[s.cls] = typeof saved?.[s.cls] === 'boolean' ? saved[s.cls] : s.open;
    return out;
}

export class ProLayout {
    constructor() {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
        this.open = openState(saved);
        this._initSections();
        this._initMenus();
    }

    _initSections() {
        for (const s of SECTIONS) {
            document.querySelectorAll(`.${s.cls}.pro-only`).forEach(block => {
                const bar = document.createElement('button');
                bar.type = 'button';
                bar.className = 'pro-fold pro-only';
                bar.dataset.fold = s.cls;
                bar.textContent = s.title;
                bar.addEventListener('click', () => this.toggle(s.cls));
                block.parentNode.insertBefore(bar, block);
            });
            this._paint(s.cls);
        }
    }

    toggle(cls) {
        this.open[cls] = !this.open[cls];
        localStorage.setItem(KEY, JSON.stringify(this.open));
        this._paint(cls);
    }

    _paint(cls) {
        const open = !!this.open[cls];
        document.querySelectorAll(`.${cls}.pro-only`).forEach(b => b.classList.toggle('pro-folded', !open));
        document.querySelectorAll(`.pro-fold[data-fold="${cls}"]`).forEach(b => {
            b.classList.toggle('open', open);
            b.setAttribute('aria-expanded', String(open));
        });
    }

    // Top bar menus: one open at a time, closed by a click anywhere else or by Escape.
    _initMenus() {
        const menus = [...document.querySelectorAll('.tb-menu')];
        const closeAll = (except) => menus.forEach(m => { if (m !== except) m.classList.remove('open'); });
        menus.forEach(menu => {
            const btn = menu.querySelector('.tb-menu-btn');
            const panel = menu.querySelector('.tb-menu-panel');
            btn?.addEventListener('click', (e) => {
                e.stopPropagation();
                closeAll(menu);
                menu.classList.toggle('open');
                // The top bar scrolls sideways and clips what hangs below it, so the panel
                // is pinned to the window under its button instead.
                if (panel && menu.classList.contains('open')) {
                    const r = btn.getBoundingClientRect();
                    panel.style.top = `${Math.round(r.bottom + 8)}px`;
                    panel.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - panel.offsetWidth - 8)))}px`;
                }
            });
            panel?.addEventListener('click', e => e.stopPropagation());
            // A menu with something switched on inside it shows a dot, so nothing running
            // (a recording, a live stream) is ever hidden behind a closed menu.
            const mark = () => btn?.classList.toggle('has-active', !!panel?.querySelector('.active, .recording, .live'));
            if (panel) new MutationObserver(mark).observe(panel, { subtree: true, attributes: true, attributeFilter: ['class'] });
            mark();
        });
        document.addEventListener('click', () => closeAll(null));
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(null); });
    }
}
