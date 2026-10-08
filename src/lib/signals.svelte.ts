import type { SignalsDoc } from '../../shared/signals';
import { loadSignals } from './api';
import { afterFirstPaint } from './paint';
import { idbGet, idbSet } from './storage';

const KEY = 'signals:v1';
const POLL_MS = 10 * 60_000;

class SignalsState {
  /** Replaced whole on each refresh, so stored raw (not deeply reactive). */
  doc = $state.raw<SignalsDoc | null>(null);
  loading = $state(true);
  error = $state<string | null>(null);
}

export const signalsState = new SignalsState();

let started = false;

/** Load ratings for all coins (cached copy first), then refresh every 10 minutes while visible. */
export async function startSignals() {
  if (started) return;
  started = true;
  await afterFirstPaint();
  // Saved copy and fresh fetch in parallel; the saved copy shows only if it lands first.
  const showCached = idbGet<SignalsDoc>(KEY).then((cached) => {
    if (cached?.items && !signalsState.doc) signalsState.doc = cached;
  });
  await Promise.all([showCached, refreshSignals()]);
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
