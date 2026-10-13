// FxFade.js — the DDJ-SB3's FX FADE pads
// One press takes a playing deck out of the mix with an effect and a volume fade, timed to
// the beat. Pressing any FX FADE pad on that deck again, before it ends, puts it all back.
//
// fadePlan() is pure so it runs under node: see FxFade.test.mjs.

// Top row is the short version, bottom row the long one.
export const FX_FADES = [
    { type: 'hpf', beats: 4, label: 'HIGH PASS' },
    { type: 'lpf', beats: 4, label: 'LOW PASS' },
    { type: 'loop', beats: 4, label: 'LOOP' },
    { type: 'spin', beats: 1, label: 'SPIN DOWN' },
    { type: 'hpf', beats: 8, label: 'HIGH PASS LONG' },
    { type: 'lpf', beats: 8, label: 'LOW PASS LONG' },
    { type: 'loop', beats: 8, label: 'LOOP LONG' },
    { type: 'spin', beats: 2, label: 'SPIN DOWN LONG' },
];

const MIN_SECONDS = 0.4;
const MAX_SECONDS = 20;

// How a pad plays out for a track at this tempo. A track with no BPM is treated as 120.
export function fadePlan(pad, bpm) {
    const fx = FX_FADES[pad];
    if (!fx) return null;
    const tempo = bpm && bpm > 0 ? bpm : 120;
    const seconds = Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, fx.beats * 60 / tempo));
    const plan = { ...fx, pad, seconds, fadeFrom: 0.35 };
    if (fx.type === 'hpf') Object.assign(plan, { filter: 'highpass', from: 20, to: 8000, q: 3 });
    if (fx.type === 'lpf') Object.assign(plan, { filter: 'lowpass', from: 18000, to: 200, q: 3 });
    // The loop starts at one beat and halves three times, so it tightens as it fades.
    if (fx.type === 'loop') Object.assign(plan, { loopBeats: 1, halveAt: [0.25, 0.5, 0.75].map(f => f * seconds) });
    // The deck slows to a quarter speed like a platter being stopped; the fade starts at once.
    if (fx.type === 'spin') Object.assign(plan, { rateTo: 0.25, fadeFrom: 0 });
    return plan;
}

export class FxFade {
    constructor(djPlayer) {
        this.dj = djPlayer;
        this.active = { A: null, B: null };
    }

    isActive(deckId) {
        return !!this.active[deckId];
    }

    trigger(deckId, pad) {
        if (this.active[deckId]) { this.cancel(deckId); return 'cancelled'; }
        const deck = this.dj.decks?.[deckId];
        const router = this.dj.audioRouter;
        const ch = router?.channels?.[deckId];
        if (!deck?.isLoaded || !deck.isPlaying || !ch) return 'idle';
        const plan = fadePlan(pad, deck.getBPM?.());
        if (!plan) return 'idle';

        const ctx = router.getAudioContext();
        const now = ctx.currentTime;
        const end = now + plan.seconds;
        const gain = ch.channelGain.gain;
        const run = {
            plan, timers: [],
            gain: gain.value,
            filter: { type: ch.filter.type, frequency: ch.filter.frequency.value, q: ch.filter.Q.value },
            loopWasActive: !!deck.loop?.active,
        };
        this.active[deckId] = run;

        // Volume: hold, then down to silence by the last beat.
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(run.gain, now + plan.seconds * plan.fadeFrom);
        gain.linearRampToValueAtTime(0.0001, end);

        if (plan.filter) {
            const top = Math.min(ctx.sampleRate / 2 * 0.95, 22000);
            ch.filter.type = plan.filter;
            ch.filter.Q.value = plan.q;
            ch.filter.frequency.cancelScheduledValues(now);
            ch.filter.frequency.setValueAtTime(Math.min(plan.from, top), now);
            ch.filter.frequency.exponentialRampToValueAtTime(Math.min(plan.to, top), end);
        }
        if (plan.type === 'loop') {
            deck.autoLoop(plan.loopBeats);
            for (const at of plan.halveAt) run.timers.push(setTimeout(() => deck.loopHalve(), at * 1000));
        }
        if (plan.type === 'spin') {
            const media = deck.getMediaElement?.();
            if (media) media.preservesPitch = false;
            const from = deck.currentRate || 1;
            const steps = Math.max(4, Math.round(plan.seconds * 30));
            for (let i = 1; i <= steps; i++) {
                const rate = from + (plan.rateTo - from) * (i / steps);
                run.timers.push(setTimeout(() => { try { deck.wavesurfer.setPlaybackRate(rate); } catch (e) { /* deck unloaded */ } }, plan.seconds * 1000 * i / steps));
            }
        }
        run.timers.push(setTimeout(() => this._finish(deckId), plan.seconds * 1000 + 30));
        return plan.label;
    }

    // The fade ran to its end: stop the deck, then put its controls back for the next track.
    _finish(deckId) {
        const deck = this.dj.decks?.[deckId];
        try { deck?.pause(); } catch (e) { /* already stopped */ }
        this._restore(deckId);
    }

    // Stopped part way: everything goes back and the deck keeps playing.
    cancel(deckId) {
        this._restore(deckId);
    }

    _restore(deckId) {
        const run = this.active[deckId];
        if (!run) return;
        this.active[deckId] = null;
        run.timers.forEach(clearTimeout);
        const deck = this.dj.decks?.[deckId];
        const router = this.dj.audioRouter;
        const ch = router?.channels?.[deckId];
        const now = router.getAudioContext().currentTime;
        if (ch) {
            ch.channelGain.gain.cancelScheduledValues(now);
            ch.channelGain.gain.setValueAtTime(run.gain, now);
            ch.filter.frequency.cancelScheduledValues(now);
            ch.filter.type = run.filter.type;
            ch.filter.frequency.setValueAtTime(run.filter.frequency, now);
            ch.filter.Q.value = run.filter.q;
        }
        if (!deck) return;
        if (run.plan.type === 'loop' && deck.loop?.active && !run.loopWasActive) deck.toggleLoop();
        if (run.plan.type === 'spin') {
            try { deck.wavesurfer.setPlaybackRate(deck.currentRate || 1); } catch (e) { /* deck unloaded */ }
            const media = deck.getMediaElement?.();
            if (media) media.preservesPitch = !!deck.keyLock;
        }
    }
}
