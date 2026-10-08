let painted: Promise<void> | null = null;

/**
 * Resolves after the browser has painted at least once. Data loading waits for
 * this so the page's shell (headings, placeholders) shows before the work of
 * rendering a full list begins, even when the network is fast.
 */
export function afterFirstPaint(): Promise<void> {
  if (typeof requestAnimationFrame === 'undefined') return Promise.resolve();
  painted ??= new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  return painted;
}
