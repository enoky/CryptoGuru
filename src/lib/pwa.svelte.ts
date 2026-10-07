/** Service worker registration, the "new version" banner and the install button. */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const pwa = $state({
  /** A new version is installed and waiting; reloading switches to it. */
  updateReady: false,
  /** Chrome/Edge/Android offer their own install dialog; null elsewhere (e.g. iPhone). */
  canInstall: false,
  installed: typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches,
});

let waiting: ServiceWorker | null = null;
let installPrompt: InstallPromptEvent | null = null;

export function startPwa() {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e as InstallPromptEvent;
    pwa.canInstall = true;
  });
  addEventListener('appinstalled', () => {
    pwa.installed = true;
    pwa.canInstall = false;
  });

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // Register after the page has loaded, so it doesn't compete with first-load downloads.
  if (document.readyState === 'complete') void register();
  else addEventListener('load', () => void register(), { once: true });
}

async function register() {
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const markWaiting = (w: ServiceWorker | null) => {
      // Only an update counts: on first install there is no older version running.
      if (w && navigator.serviceWorker.controller) {
        waiting = w;
        pwa.updateReady = true;
      }
    };
    markWaiting(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed') markWaiting(w);
      });
    });
    // Phones keep the app open for days: look for updates when it comes back to the foreground.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg.update().catch(() => {});
    });
  } catch {
    // No offline support (e.g. private mode); the app still works online.
  }
}

export function applyUpdate() {
  if (!waiting) return location.reload();
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  waiting.postMessage('SKIP_WAITING');
}

export async function install() {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
  pwa.canInstall = false;
}
