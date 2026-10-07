import type { SignalsDoc } from '../../shared/signals';
import { loadSignals } from './api';
import { idbGet, idbSet } from './storage';

const KEY = 'signals:v1';
const POLL_MS = 10 * 60_000;

export const signalsState = $state({
  doc: null as SignalsDoc | null,
  loading: true,
  error: null as string | null,
});

let started = false;

/** Load ratings for all coins (cached copy first), then refresh every 10 minutes while visible. */
export async function startSignals() {
  if (started) return;
  started = true;
  const cached = await idbGet<SignalsDoc>(KEY);
  if (cached?.items && !signalsState.doc) signalsState.doc = cached;
  await refreshSignals();
  setInterval(() => {
    if (document.visibilityState === 'visible') void refreshSignals();
  }, POLL_MS);
}

export async function refreshSignals() {
  try {
    const doc = await loadSignals();
    signalsState.doc = doc;
    signalsState.error = null;
    void idbSet(KEY, doc);
  } catch (err) {
    signalsState.error = err instanceof Error ? err.message : 'Couldn’t load signals';
  } finally {
    signalsState.loading = false;
  }
}
