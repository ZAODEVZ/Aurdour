// Feedback.js — the FEEDBACK button (Zaal, 16 Oct 2026). Opens /feedback in a new tab with the
// song on air, so a report says what was playing when it happened.

// The song on air: the playing deck, louder side of the crossfader first.
export function onAir(decks = {}, crossfade = 0.5) {
    const order = crossfade > 0.5 ? ['B', 'A'] : ['A', 'B'];
    for (const id of order) {
        const d = decks[id];
        const m = d?.metadata?.metadata;
        if (d?.isPlaying && m?.title) return m.artist ? `${m.artist} - ${m.title}` : m.title;
    }
    return '';
}

export const feedbackUrl = (now) => `/feedback${now ? `?now=${encodeURIComponent(now)}` : ''}`;

export class Feedback {
    constructor(dj) {
        if (typeof document === 'undefined') return;
        const btn = document.getElementById('feedback-btn');
        if (!btn) return;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const cf = Number(document.getElementById('crossfader')?.value ?? 50) / 100;
            window.open(feedbackUrl(onAir(dj.decks, cf)), '_blank', 'noopener');
        });
    }
}
