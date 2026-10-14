// Install.js — one INSTALL button that does the right thing on every device
// Chrome and Edge (Windows, Mac, Linux, Android, ChromeOS) can install with one click, so
// the button opens the browser's own install box. iPhone, iPad, Safari on a Mac and Firefox
// have no such box, so the button shows the two or three taps that do it there instead.
// Once the app is installed and opened as an app, the button is gone.
//
// installPlan() is pure so it runs under node: see Install.test.mjs.

// env: { ua, standalone, canPrompt, maxTouchPoints }
// Returns { show, mode, title, steps }. mode is 'prompt', 'steps' or 'none'.
export function installPlan(env, appName = 'ZAO MixZ') {
    const ua = env.ua || '';
    if (env.standalone) return { show: false, mode: 'none', title: '', steps: [] };
    if (env.canPrompt) return { show: true, mode: 'prompt', title: `Install ${appName}`, steps: [] };

    // An iPad says it is a Mac; the touch screen gives it away.
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (env.maxTouchPoints || 0) > 1);
    const android = /Android/.test(ua);
    const firefox = /Firefox|FxiOS/.test(ua);
    const edge = /Edg\//.test(ua);
    const chromium = /Chrome\/|Chromium\/|CriOS/.test(ua) && !/OPR\//.test(ua);
    const safari = /Safari\//.test(ua) && !chromium && !firefox && !android;
    const mac = /Macintosh/.test(ua) && !ios;

    if (ios) {
        const inSafari = safari && !/CriOS|FxiOS|EdgiOS/.test(ua);
        return {
            show: true, mode: 'steps', title: `Add ${appName} to your Home Screen`,
            steps: inSafari
                ? ['Tap the Share button (the square with the arrow).', 'Scroll down and tap Add to Home Screen.', 'Tap Add.']
                : ['Tap the Share button in the address bar.', 'Tap Add to Home Screen.', 'Tap Add. If it is not listed, open this page in Safari first.'],
        };
    }
    if (mac && safari) {
        return { show: true, mode: 'steps', title: `Add ${appName} to your Dock`, steps: ['In the menu bar, click File.', 'Click Add to Dock.', 'Click Add.'] };
    }
    if (firefox && android) {
        return { show: true, mode: 'steps', title: `Install ${appName}`, steps: ['Tap the three dots menu.', 'Tap Install, or Add to Home screen.'] };
    }
    if (firefox) {
        return { show: true, mode: 'steps', title: `Install ${appName}`, steps: ['Firefox on a computer cannot install web apps.', 'Open this page in Chrome or Edge and press INSTALL there.'] };
    }
    if (android) {
        return { show: true, mode: 'steps', title: `Install ${appName}`, steps: ['Tap the three dots menu.', 'Tap Install app, or Add to Home screen.'] };
    }
    if (edge) {
        return { show: true, mode: 'steps', title: `Install ${appName}`, steps: ['Click the three dots menu, top right.', 'Go to Apps.', `Click Install ${appName}.`] };
    }
    if (chromium) {
        return { show: true, mode: 'steps', title: `Install ${appName}`, steps: ['Look for the install icon at the right end of the address bar.', 'Or open the three dots menu, then Cast, save and share.', 'Click Install page as app.'] };
    }
    // A browser we do not know: say nothing rather than give wrong steps.
    return { show: false, mode: 'none', title: '', steps: [] };
}

export const isStandalone = () => !!(window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches || window.navigator.standalone);

export class Install {
    // button: the INSTALL button. sheet: a small box for the step by step version.
    constructor({ button, sheet, appName = 'ZAO MixZ' }) {
        Object.assign(this, { button, sheet, appName });
        this.deferred = null;
        window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); this.deferred = e; this.paint(); });
        window.addEventListener('appinstalled', () => { this.deferred = null; this.installed = true; this.hideSheet(); this.paint(); });
        window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => this.paint());
        this.button?.addEventListener('click', () => this.go());
        this.sheet?.querySelector('[data-install-close]')?.addEventListener('click', () => this.hideSheet());
        this.paint();
    }

    plan() {
        return installPlan({ ua: navigator.userAgent, standalone: this.installed || isStandalone(), canPrompt: !!this.deferred, maxTouchPoints: navigator.maxTouchPoints }, this.appName);
    }

    paint() {
        const plan = this.plan();
        this.button?.classList.toggle('hidden', !plan.show);
        if (this.button && plan.show) this.button.title = plan.title;
    }

    async go() {
        const plan = this.plan();
        if (plan.mode === 'prompt' && this.deferred) {
            const e = this.deferred;
            this.deferred = null;      // the browser only lets each one be used once
            e.prompt();
            try { await e.userChoice; } catch (err) { /* closed */ }
            this.paint();
            return;
        }
        if (plan.mode !== 'steps' || !this.sheet) return;
        const title = this.sheet.querySelector('[data-install-title]');
        const list = this.sheet.querySelector('[data-install-steps]');
        if (title) title.textContent = plan.title;
        if (list) {
            list.textContent = '';
            for (const step of plan.steps) { const li = document.createElement('li'); li.textContent = step; list.appendChild(li); }
        }
        this.sheet.classList.remove('hidden');
    }

    hideSheet() { this.sheet?.classList.add('hidden'); }
}
