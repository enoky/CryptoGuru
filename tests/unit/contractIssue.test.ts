import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const run = createRequire(import.meta.url)('../../scripts/contract-issue.cjs');

function fakeGithub(openIssues: { number: number }[] = []) {
  const calls: { method: string; args: Record<string, unknown> }[] = [];
  const rec = (method: string, result: unknown = {}) => async (args: Record<string, unknown>) => (calls.push({ method, args }), result);
  return {
    calls,
    rest: {
      issues: {
        listForRepo: rec('listForRepo', { data: openIssues }),
        create: rec('create'),
        createComment: rec('createComment'),
        update: rec('update'),
        createLabel: rec('createLabel'),
      },
    },
  };
}

const context = { repo: { owner: 'o', repo: 'r' }, serverUrl: 'https://github.com', runId: 99 };
const report = {
  testResults: [
    {
      assertionResults: [
        { fullName: 'Binance 24h tickers', status: 'passed', failureMessages: [] },
        { fullName: 'CoinGecko markets: top 100 with prices', status: 'failed', failureMessages: ['Error: CoinGecko markets: 100 of 100 items failed validation\n    at stack'] },
      ],
    },
  ],
};

describe('contract issue', () => {
  it('opens a labelled issue listing each failure', async () => {
    const gh = fakeGithub();
    expect(await run({ github: gh, context, outcome: 'failure', report })).toBe('opened');
    const created = gh.calls.find((c) => c.method === 'create')!.args;
    expect(created.labels).toEqual(['api-contract']);
    expect(created.body).toContain('**CoinGecko markets: top 100 with prices**: Error: CoinGecko markets: 100 of 100 items failed validation');
    expect(created.body).not.toContain('Binance');
    expect(created.body).toContain('actions/runs/99');
  });

  it('comments instead of opening a duplicate', async () => {
    const gh = fakeGithub([{ number: 7 }]);
    expect(await run({ github: gh, context, outcome: 'failure', report })).toBe('commented');
    expect(gh.calls.some((c) => c.method === 'create')).toBe(false);
  });

  it('closes the issue once checks pass again, and does nothing otherwise', async () => {
    const gh = fakeGithub([{ number: 7 }]);
    expect(await run({ github: gh, context, outcome: 'success', report: null })).toBe('closed');
    expect(gh.calls.find((c) => c.method === 'update')!.args).toMatchObject({ issue_number: 7, state: 'closed' });
    expect(await run({ github: fakeGithub(), context, outcome: 'success', report: null })).toBe('ok');
  });

  it('still reports when the check crashed before writing a report', async () => {
    const gh = fakeGithub();
    await run({ github: gh, context, outcome: 'failure', report: null });
    expect(gh.calls.find((c) => c.method === 'create')!.args.body).toContain('did not finish');
  });
});
