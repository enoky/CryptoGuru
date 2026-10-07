// The Workers runtime only allows handler exports from the entry module,
// so the implementation (and its test-only exports) lives in app.ts.
import handler from './app';

export type { Env } from './app';
export default handler;
