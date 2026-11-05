// When a new service worker takes over, the page used to reload itself (SW_UPDATED in
// index.html), which stopped a set mid-song. Now the page offers a reload and never takes one:
// the DJ taps RELOAD when it suits, and while a deck plays the first tap only warns.

export const BANNER_ID = 'sw-ready-banner';
export const AUTO_KEY = 'mixz-sw-auto-reload';

// Zaal, 5 Nov 2026: "Why are u asking me to do something that would take half a second". A page
// with nothing playing takes the new version by itself, once per version (the key stops a reload
// loop if the new copy comes up idle and the message arrives again). Only a playing page asks.
// store: sessionStorage-like { getItem, setItem }, or null when the browser blocks it.
export function swUpdated(doc, { playing = () => false, reload, version = '', store = null } = {}) {
    if (!playing()) {
        let seen = null;
        try { seen = store?.getItem(AUTO_KEY); } catch { seen = null; }
        if (seen !== String(version)) {
            try { store?.setItem(AUTO_KEY, String(version)); } catch { /* reload anyway */ }
            reload();
            return null;
        }
    }
    return swUpdatePrompt(doc, { playing, reload });
}

// playing: () => is a deck playing now; reload: () => reload the page.
export function swUpdatePrompt(doc, { playing = () => false, reload } = {}) {
    const old = doc.getElementById(BANNER_ID);
    if (old) return old;
    const banner = doc.createElement('div');
    banner.id = BANNER_ID;
    banner.className = 'sw-update-banner';
    // While a deck plays (a set, a stream) it sits small in the corner, off the library and decks.
    if (playing()) banner.classList.add('compact');
    const text = doc.createElement('span');
    text.textContent = playing() ? 'New version ready - reload after the set' : 'New version ready';
    const go = doc.createElement('button');
    go.textContent = 'RELOAD';
    const later = doc.createElement('button');
    later.textContent = 'LATER';
    let warned = false;
    go.addEventListener('click', () => {
        if (playing() && !warned) {
            warned = true;
            go.textContent = 'RELOAD STOPS THE MUSIC - TAP AGAIN';
            return;
        }
        reload();
    });
    later.addEventListener('click', () => banner.remove());
    banner.append(text, go, later);
    doc.body.appendChild(banner);
    banner.classList.add('show');
    return banner;
}
