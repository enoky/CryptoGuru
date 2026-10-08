export type Route =
  | { name: 'markets' }
  | { name: 'asset'; id: string }
  | { name: 'watchlist' }
  | { name: 'signals' }
  | { name: 'backtest' }
  | { name: 'about' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] || '/';
  const asset = path.match(/^\/asset\/([a-z0-9-]{1,80})$/);
  if (asset) return { name: 'asset', id: asset[1] };
  if (path === '/watchlist') return { name: 'watchlist' };
  if (path === '/signals') return { name: 'signals' };
  if (path === '/signals/backtest') return { name: 'backtest' };
  if (path === '/about') return { name: 'about' };
  return { name: 'markets' };
}

export const router = $state({ route: parseHash(typeof location === 'undefined' ? '' : location.hash) });

/** Page changes inside the app, so "back" knows whether there is a page to go back to. */
let navigations = 0;

export function startRouter() {
  addEventListener('hashchange', () => {
    navigations++;
    router.route = parseHash(location.hash);
    window.scrollTo(0, 0);
  });
}

export function back(fallback = '#/') {
  if (navigations > 0) history.back();
  else location.hash = fallback;
}
