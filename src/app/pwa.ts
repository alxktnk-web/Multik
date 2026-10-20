let waiting: ServiceWorker | null = null;
let canUpdate = () => false;
let applying = false;

export function updateNotice(): void {
  const banner = document.getElementById('app-update');
  if (banner) banner.hidden = !waiting || !canUpdate();
}

export function initPwa(isSafe: () => boolean): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  canUpdate = isSafe;
  const banner = document.createElement('button');
  banner.id = 'app-update';
  banner.className = 'update-notice';
  banner.textContent = 'Update available · Restart';
  banner.hidden = true;
  banner.onclick = () => {
    if (!canUpdate() || !waiting) return;
    applying = true;
    waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
  };
  document.body.append(banner);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) location.reload();
  });
  void navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((registration) => {
    const inspect = () => {
      if (registration.waiting && navigator.serviceWorker.controller) waiting = registration.waiting;
      updateNotice();
    };
    inspect();
    registration.addEventListener('updatefound', () => {
      registration.installing?.addEventListener('statechange', inspect);
    });
  }).catch(() => {
    // An online session remains usable; retry registration on the next launch.
  });
}
