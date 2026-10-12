// JogWheel.js — Circular jog wheel for nudging, scratching, and beat jumping
// Enhanced: fractional beat jumps, beat position indicator

export class JogWheel {
    constructor(decks) {
        this.decks = decks;
        this.wheels = {};

        ['a', 'b'].forEach(ch => {
            const canvas = document.getElementById(`jog-${ch}`);
            if (!canvas) return;

            const deckId = ch.toUpperCase();
            this.wheels[deckId] = {
                canvas,
                ctx: canvas.getContext('2d'),
                dragging: false,
                lastAngle: 0,
                rotation: 0,
                nudgeTimeout: null,
            };

            this._initWheel(deckId, canvas);
            this._initBeatJumps(ch, deckId);
            this._initNudge(ch, deckId);
        });

        this._drawLoop();
        this._startBeatPositionUpdater();
    }

    // MIDI controller jog wheel: scratch (vinyl surface)
    scratch(deckId, delta) {
        const deck = this.decks[deckId];
        if (!deck || !deck.isLoaded) return;
        const scrubSpeed = 0.05; // seconds per unit delta
        const currentTime = deck.getCurrentTime();
        const dur = deck.getDuration();
        const newTime = Math.max(0, Math.min(dur, currentTime + delta * scrubSpeed));
        if (dur > 0) deck.wavesurfer.seekTo(newTime / dur);

        // Update visual rotation
        const state = this.wheels[deckId];
        if (state) state.rotation += delta * 0.5;
    }

    // MIDI controller jog wheel: nudge (outer ring pitch bend)
    nudge(deckId, amount) {
        const deck = this.decks[deckId];
        if (!deck || !deck.isLoaded) return;
        const baseRate = deck.currentRate;
        deck.wavesurfer.setPlaybackRate(baseRate + amount);

        // Return to base rate after brief moment
        const state = this.wheels[deckId];
        if (state) {
            clearTimeout(state.nudgeTimeout);
            state.nudgeTimeout = setTimeout(() => {
                deck.wavesurfer.setPlaybackRate(deck.currentRate);
            }, 150);
        }
    }

    _initWheel(deckId, canvas) {
        const state = this.wheels[deckId];
        const rect = () => canvas.getBoundingClientRect();

        const getAngle = (x, y) => {
            const r = rect();
            const cx = r.width / 2;
            const cy = r.height / 2;
            return Math.atan2(y - r.top - cy, x - r.left - cx);
        };

        const onStart = (x, y) => {
            state.dragging = true;
            state.lastAngle = getAngle(x, y);
            canvas.classList.add('active');
        };

        const onMove = (x, y) => {
            if (!state.dragging) return;
            const angle = getAngle(x, y);
            let delta = angle - state.lastAngle;

            // Handle angle wrapping
            if (delta > Math.PI) delta -= 2 * Math.PI;
            if (delta < -Math.PI) delta += 2 * Math.PI;

            state.lastAngle = angle;
            state.rotation += delta;

            // Scrub: delta maps to time offset
            const deck = this.decks[deckId];
            if (deck && deck.isLoaded) {
                const scrubSpeed = 0.15; // seconds per radian
                const currentTime = deck.getCurrentTime();
                const dur = deck.getDuration();
                const newTime = Math.max(0, Math.min(dur, currentTime + delta * scrubSpeed));
                if (dur > 0) deck.wavesurfer.seekTo(newTime / dur);
            }
        };

        const onEnd = () => {
            state.dragging = false;
            canvas.classList.remove('active');
        };

        // Mouse events
        canvas.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
        window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
        window.addEventListener('mouseup', onEnd);

        // Touch events
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const t = e.touches[0];
            onStart(t.clientX, t.clientY);
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const t = e.touches[0];
            onMove(t.clientX, t.clientY);
        }, { passive: false });

        canvas.addEventListener('touchend', onEnd);
    }

    _initBeatJumps(ch, deckId) {
        const section = document.getElementById(`deck-${ch}`);
        if (!section) return;

        section.querySelectorAll('.beat-jump-btn').forEach(btn => {
            const beats = parseFloat(btn.dataset.beats); // parseFloat supports fractional beats
            const dir = btn.dataset.dir === 'fwd' ? 1 : -1;

            btn.addEventListener('click', () => {
                const deck = this.decks[deckId];
                const bpm = deck.getBPM();
                if (!bpm || !deck.isLoaded) return;

                const beatDuration = 60 / bpm;
                const jumpTime = beats * beatDuration * dir;
                const currentTime = deck.getCurrentTime();
                const dur = deck.getDuration();
                const newTime = Math.max(0, Math.min(dur, currentTime + jumpTime));
                if (dur > 0) deck.wavesurfer.seekTo(newTime / dur);

                // Flash the button
                btn.classList.add('active');
                setTimeout(() => btn.classList.remove('active'), 150);
            });
        });
    }

    _initNudge(ch, deckId) {
        const nudgeFwd = document.getElementById(`nudge-${ch}-fwd`);
        const nudgeBack = document.getElementById(`nudge-${ch}-back`);

        [nudgeFwd, nudgeBack].forEach((btn, i) => {
            if (!btn) return;
            const direction = i === 0 ? 1 : -1;

            const startNudge = () => {
                const deck = this.decks[deckId];
                if (!deck || !deck.isLoaded) return;
                const baseRate = deck.currentRate;
                deck.wavesurfer.setPlaybackRate(baseRate + direction * 0.04);
                btn.classList.add('active');
            };

            const stopNudge = () => {
                const deck = this.decks[deckId];
                if (!deck) return;
                deck.wavesurfer.setPlaybackRate(deck.currentRate);
                btn.classList.remove('active');
            };

            btn.addEventListener('mousedown', startNudge);
            btn.addEventListener('mouseup', stopNudge);
            btn.addEventListener('mouseleave', stopNudge);
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); startNudge(); }, { passive: false });
            btn.addEventListener('touchend', stopNudge);
        });
    }

    // ===== BEAT POSITION INDICATOR =====

    _startBeatPositionUpdater() {
        setInterval(() => {
            ['a', 'b'].forEach(ch => {
                const deckId = ch.toUpperCase();
                const indicator = document.getElementById(`beat-pos-${ch}`);
                if (!indicator) return;

                const deck = this.decks[deckId];
                if (!deck || !deck.isLoaded) {
                    indicator.textContent = '--';
                    return;
                }

                const bpm = deck.getBPM();
                if (!bpm) {
                    indicator.textContent = '--';
                    return;
                }

                const currentTime = deck.getCurrentTime();
                const beatDuration = 60 / bpm;
                const currentBeat = currentTime / beatDuration;
                const bar = Math.floor(currentBeat / 4) + 1;
                const beatInBar = Math.floor(currentBeat % 4) + 1;

                indicator.textContent = `${bar}.${beatInBar}`;

                // Color the beat position based on beat in bar
                const colors = ['#ff4444', '#ffcc00', '#ffcc00', '#ffcc00'];
                indicator.style.color = colors[beatInBar - 1] || '#ffcc00';
            });
        }, 50); // Update ~20fps
    }

    _drawLoop() {
        Object.entries(this.wheels).forEach(([deckId, state]) => {
            this._drawWheel(deckId, state);
        });
        requestAnimationFrame(() => this._drawLoop());
    }

    // A platter, drawn at 2x for sharp screens: brushed outer ring with tick marks, vinyl
    // grooves, a centre label with the deck letter, and a position marker that turns with the
    // track. The ring lights up on the beat.
    _drawWheel(deckId, state) {
        const { canvas, ctx, dragging } = state;
        if (!canvas) return;

        // Keep the drawing buffer at 2x the size the page gives the canvas
        const cssSize = Math.round(canvas.clientWidth || 120);
        const want = Math.max(240, cssSize * 2);
        if (canvas.width !== want) { canvas.width = want; canvas.height = want; }

        const w = canvas.width;
        const cx = w / 2;
        const cy = w / 2;
        const R = w / 2 - 2;
        const u = w / 240; // scale unit
        const isA = deckId === 'A';
        const rgb = isA ? '0, 212, 255' : '255, 107, 53';
        const deck = this.decks[deckId];
        const isPlaying = !!deck?.isPlaying;
        const loaded = !!deck?.isLoaded;
        if (isPlaying) state.rotation = deck.getCurrentTime() * 2;
        const rot = state.rotation;

        ctx.clearRect(0, 0, w, w);

        // Beat pulse, 1 on the beat fading to 0
        let pulse = 0;
        const bpm = loaded && deck.getBPM ? deck.getBPM() : null;
        if (bpm && isPlaying) {
            const beat = 60 / bpm;
            pulse = Math.pow(1 - ((deck.getCurrentTime() % beat) / beat), 3);
        }

        // Outer ring: brushed metal
        const ring = ctx.createLinearGradient(0, 0, w, w);
        ring.addColorStop(0, '#3a3d4d'); ring.addColorStop(0.45, '#15161f'); ring.addColorStop(0.55, '#262835'); ring.addColorStop(1, '#0c0d13');
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill();

        // Tick marks on the ring, turning with the platter
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
        for (let i = 0; i < 72; i++) {
            const major = i % 6 === 0;
            ctx.rotate((Math.PI * 2) / 72);
            ctx.beginPath(); ctx.moveTo(R - 4 * u, 0); ctx.lineTo(R - (major ? 13 : 8) * u, 0);
            ctx.strokeStyle = major ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.16)';
            ctx.lineWidth = (major ? 1.6 : 1) * u; ctx.stroke();
        }
        ctx.restore();

        // Lit ring: deck colour, brighter on the beat and while touched
        const lit = dragging ? 0.95 : loaded ? 0.5 + pulse * 0.45 : 0.18;
        ctx.beginPath(); ctx.arc(cx, cy, R - 17 * u, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${rgb}, ${lit})`; ctx.lineWidth = 2.5 * u;
        ctx.shadowColor = `rgba(${rgb}, ${lit})`; ctx.shadowBlur = (loaded ? 10 + pulse * 14 : 0) * u; ctx.stroke(); ctx.shadowBlur = 0;

        // Vinyl surface
        const vr = R - 21 * u;
        const vinyl = ctx.createRadialGradient(cx - vr * 0.3, cy - vr * 0.35, vr * 0.05, cx, cy, vr);
        vinyl.addColorStop(0, '#23242e'); vinyl.addColorStop(0.5, '#0e0f15'); vinyl.addColorStop(1, '#050508');
        ctx.beginPath(); ctx.arc(cx, cy, vr, 0, Math.PI * 2); ctx.fillStyle = vinyl; ctx.fill();

        // Grooves
        for (let g = vr - 5 * u; g > 34 * u; g -= 5.5 * u) {
            ctx.beginPath(); ctx.arc(cx, cy, g, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1 * u; ctx.stroke();
        }

        // Sheen: two soft light wedges that stay put while the record turns
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, vr, 0, Math.PI * 2); ctx.clip();
        for (const start of [-2.5, 0.65]) {
            const sheen = ctx.createConicGradient ? ctx.createConicGradient(start, cx, cy) : null;
            if (!sheen) break;
            sheen.addColorStop(0, 'rgba(255,255,255,0)'); sheen.addColorStop(0.06, 'rgba(255,255,255,0.07)'); sheen.addColorStop(0.12, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = sheen; ctx.fillRect(0, 0, w, w);
        }
        ctx.restore();

        // Position marker: a bright stripe from the label to the edge
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
        ctx.beginPath(); ctx.moveTo(36 * u, 0); ctx.lineTo(vr - 4 * u, 0);
        ctx.strokeStyle = `rgba(${rgb}, ${loaded ? 0.95 : 0.35})`; ctx.lineWidth = 3 * u; ctx.lineCap = 'round';
        ctx.shadowColor = `rgba(${rgb}, 0.9)`; ctx.shadowBlur = loaded ? 8 * u : 0; ctx.stroke(); ctx.shadowBlur = 0;
        ctx.restore();

        // Centre label
        const lr = 32 * u;
        const label = ctx.createRadialGradient(cx, cy - lr * 0.4, lr * 0.1, cx, cy, lr);
        label.addColorStop(0, `rgba(${rgb}, ${loaded ? 0.95 : 0.4})`); label.addColorStop(1, `rgba(${rgb}, ${loaded ? 0.55 : 0.18})`);
        ctx.beginPath(); ctx.arc(cx, cy, lr, 0, Math.PI * 2); ctx.fillStyle = label; ctx.fill();
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
        ctx.fillStyle = 'rgba(5, 6, 10, 0.85)'; ctx.font = `800 ${26 * u}px "Bricolage Grotesque", "DM Sans", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(deckId, 0, 1 * u);
        ctx.restore();
        ctx.beginPath(); ctx.arc(cx, cy, 3.5 * u, 0, Math.PI * 2); ctx.fillStyle = '#05060a'; ctx.fill();
    }
}
