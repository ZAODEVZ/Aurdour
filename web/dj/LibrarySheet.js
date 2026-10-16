// LibrarySheet.js — the music library as a button
//
// The library lives under the decks, which on a laptop is below the fold and on a stream is
// cut in half. LIBRARY in the top bar opens the same library as a sheet over the decks,
// full height, with its search box focused. Escape or the bar at its top closes it. The
// library's own code is untouched: only where it is drawn changes.

export class LibrarySheet {
    constructor(dj) {
        this.dj = dj;
        this.btn = document.getElementById('library-open');
        this.row = document.querySelector('.bottom-row');
        if (!this.btn || !this.row) return;
        const bar = document.createElement('div');
        bar.className = 'lib-sheet-bar';
        bar.innerHTML = '<span class="lib-sheet-title">LIBRARY</span><span class="lib-sheet-hint">Load a track to a deck, or drop it on the switch pad. Esc closes.</span><button class="btn-toolbar btn-sm" id="library-close">CLOSE</button>';
        this.row.insertBefore(bar, this.row.firstChild);
        this.btn.addEventListener('click', () => this.toggle());
        bar.querySelector('#library-close').addEventListener('click', () => this.close());
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.open) this.close(); });
    }

    get open() { return document.body.classList.contains('lib-open'); }

    toggle() { this.open ? this.close() : this.show(); }

    show() {
        document.body.classList.add('lib-open');
        this.btn?.classList.add('active');
        setTimeout(() => document.getElementById('library-search')?.focus({ preventScroll: true }), 50);
    }

    close() {
        document.body.classList.remove('lib-open');
        this.btn?.classList.remove('active');
        document.getElementById('library-search')?.blur();
    }
}
