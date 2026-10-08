// Called from .github/workflows/contract.yml (actions/github-script).
// Opens a GitHub issue when the nightly API check fails, comments on it if
// one is already open, and closes it when the check passes again.

const LABEL = 'api-contract';

/** Turn a Vitest JSON report into "- test name: first line of the error" lines. */
function summarize(report) {
  const lines = [];
  for (const file of report?.testResults ?? []) {
    for (const t of file.assertionResults ?? []) {
      if (t.status !== 'failed') continue;
      const msg = String(t.failureMessages?.[0] ?? 'failed').split('\n')[0].slice(0, 300);
      lines.push(`- **${t.fullName}**: ${msg}`);
    }
  }
  if (lines.length === 0) lines.push('- The check did not finish (see the run log).');
  return lines;
}

module.exports = async function run({ github, context, outcome, report }) {
  const { owner, repo } = context.repo;
  const runUrl = `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`;
  const open = await github.rest.issues.listForRepo({ owner, repo, state: 'open', labels: LABEL, per_page: 1 });
  const existing = open.data[0];

  if (outcome === 'success') {
    if (!existing) return 'ok';
    await github.rest.issues.createComment({ owner, repo, issue_number: existing.number, body: `All API checks pass again ([run](${runUrl})). Closing.` });
    await github.rest.issues.update({ owner, repo, issue_number: existing.number, state: 'closed', state_reason: 'completed' });
    return 'closed';
  }

  const failures = summarize(report).join('\n');
  if (existing) {
    await github.rest.issues.createComment({ owner, repo, issue_number: existing.number, body: `Still failing ([run](${runUrl})):\n\n${failures}` });
    return 'commented';
  }
  try {
    await github.rest.issues.createLabel({ owner, repo, name: LABEL, color: 'd93f0b', description: 'Nightly live API check failed' });
  } catch {
    // Label already exists.
  }
  await github.rest.issues.create({
    owner,
    repo,
    title: 'Nightly API check failed: an upstream API may have changed',
    labels: [LABEL],
    body: [
      `The nightly live API check failed ([run](${runUrl})). The app falls back to other sources automatically, but this source needs a look:`,
      '',
      failures,
      '',
      'Next steps: check the provider’s changelog, update the client in `shared/sources/` and its schema, and add a fixture from the new response. This issue closes itself when the check passes again.',
    ].join('\n'),
  });
  return 'opened';
};

module.exports.summarize = summarize;
