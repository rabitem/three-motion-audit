import { describe, expect, it, vi } from 'vitest';
import autoMerge, { REQUIRED_CHECKS, getCheckState, hasBlockingReview, isUnchangedDependabotPR } from './dependabot-auto-merge.mjs';

const head = 'verified-dependency-commit';
const base = 'tested-main-commit';
const runId = 123;
const repository = 'rabitem/three-motion-audit';
const pr = {
  number: 51, state: 'open', draft: false, merged: false,
  user: { login: 'dependabot[bot]' },
  head: { sha: head, repo: { full_name: repository } },
  base: { ref: 'main', sha: base },
  mergeable: true, mergeable_state: 'clean',
};
const checks = REQUIRED_CHECKS.map(({ name, app }) => ({ name, app: { slug: app }, status: 'completed', conclusion: 'success' }));
const statuses = [];

describe('Dependabot check gate', () => {
  it('requires every CI job to have succeeded', () => {
    expect(getCheckState(checks, statuses, runId)).toBe('ready');
    expect(getCheckState([], statuses, runId)).toBe('pending');
    expect(getCheckState(checks.slice(1), statuses, runId)).toBe('pending');
  });

  it.each(['skipped', 'neutral'])('does not accept a required CI conclusion of %s', (conclusion) => {
    expect(getCheckState([{ ...checks[0], conclusion }, ...checks.slice(1)], statuses, runId)).toBe('pending');
  });

  it('does not trust a same-named CI check from a different app', () => {
    expect(getCheckState([{ ...checks[0], app: { slug: 'other-app' } }, ...checks.slice(1)], statuses, runId)).toBe('pending');
  });

  it.each(['failure', 'cancelled', 'timed_out', 'action_required', 'stale', null])('blocks a check with conclusion %s', (conclusion) => {
    expect(getCheckState([...checks, { status: 'completed', conclusion }], statuses, runId)).toBe('failed');
  });

  it('waits for other checks and ignores only its own running job', () => {
    const other = { name: 'Other check', status: 'in_progress' };
    expect(getCheckState([...checks, other], statuses, runId)).toBe('pending');
    const own = { ...other, details_url: `https://github.com/${repository}/actions/runs/${runId}/job/456` };
    expect(getCheckState([...checks, own], statuses, runId)).toBe('ready');
  });

  it('uses the newest commit status rather than an earlier failure or earlier success', () => {
    const passed = { context: 'external', state: 'success' };
    expect(getCheckState(checks, [passed, { context: 'external', state: 'failure' }], runId)).toBe('ready');
    expect(getCheckState(checks, [{ context: 'external', state: 'pending' }, passed], runId)).toBe('pending');
    expect(getCheckState(checks, [{ context: 'external', state: 'error' }], runId)).toBe('failed');
  });
});

describe('Dependabot PR identity and reviews', () => {
  it('accepts only the same bot PR, repository, target branch, head, and base', () => {
    expect(isUnchangedDependabotPR(pr, pr, repository, 'main')).toBe(true);
    for (const changed of [
      { ...pr, state: 'closed' }, { ...pr, draft: true }, { ...pr, merged: true },
      { ...pr, user: { login: 'human' } },
      { ...pr, head: { ...pr.head, sha: 'untested-commit' } },
      { ...pr, head: { ...pr.head, repo: { full_name: 'fork/three-motion-audit' } } },
      { ...pr, base: { ...pr.base, sha: 'new-main' } },
      { ...pr, base: { ...pr.base, ref: 'other-branch' } },
    ]) expect(isUnchangedDependabotPR(changed, pr, repository, 'main')).toBe(false);
  });

  it('honors change requests until the reviewer approves or dismisses them', () => {
    const blocked = { user: { id: 1 }, state: 'CHANGES_REQUESTED' };
    expect(hasBlockingReview([blocked, { ...blocked, state: 'COMMENTED' }])).toBe(true);
    expect(hasBlockingReview([blocked, { ...blocked, state: 'APPROVED' }])).toBe(false);
    expect(hasBlockingReview([blocked, { ...blocked, state: 'DISMISSED' }])).toBe(false);
  });

  it('keeps a change request from one reviewer when another approves', () => {
    expect(hasBlockingReview([{ user: { id: 1 }, state: 'CHANGES_REQUESTED' }, { user: { id: 2 }, state: 'APPROVED' }])).toBe(true);
  });
});

function scenario({ updateType = 'version-update:semver-minor', states = [pr, pr], files, checkRuns = checks, reviews = [] } = {}) {
  let reads = 0;
  const github = {
    rest: {
      pulls: {
        get: vi.fn(async () => ({ data: states[Math.min(reads++, states.length - 1)] })),
        merge: vi.fn(async () => ({ data: { merged: true } })),
        listFiles: 'files', listReviews: 'reviews',
      },
      checks: { listForRef: 'checks' },
      repos: { listCommitStatusesForRef: 'statuses' },
    },
    paginate: vi.fn(async (endpoint) => ({
      files: files ?? [{ filename: 'package-lock.json', status: 'modified' }],
      checks: checkRuns, statuses, reviews,
    })[endpoint]),
  };
  return {
    github, updateType, context: {
      repo: { owner: 'rabitem', repo: 'three-motion-audit' }, runId,
      payload: { pull_request: pr, repository: { default_branch: 'main' } },
    }, core: { info: vi.fn() }, wait: vi.fn(),
  };
}

describe('Dependabot merge operation', () => {
  it.each(['version-update:semver-minor', 'version-update:semver-patch'])('merges %s using the checked head SHA', async (updateType) => {
    const test = scenario({ updateType });
    await autoMerge(test);
    expect(test.github.rest.pulls.merge).toHaveBeenCalledWith({
      owner: 'rabitem', repo: 'three-motion-audit', pull_number: 51, sha: head, merge_method: 'squash',
    });
  });

  it.each(['version-update:semver-major', '', undefined])('leaves major and unclassified updates manual (%s)', async (updateType) => {
    const test = { ...scenario(), updateType };
    await autoMerge(test);
    expect(test.github.rest.pulls.merge).not.toHaveBeenCalled();
  });

  it.each([
    [[{ filename: '.github/workflows/ci.yml', status: 'modified' }]],
    [[{ filename: 'package-lock.json', status: 'removed' }]],
    [[]],
  ])('rejects PRs that change more than the npm manifest and lockfile (%j)', async (files) => {
    const test = scenario({ files });
    await expect(autoMerge(test)).rejects.toThrow('Only npm');
    expect(test.github.rest.pulls.merge).not.toHaveBeenCalled();
  });

  it('waits while the PR is not cleanly mergeable', async () => {
    const test = scenario({ states: [{ ...pr, mergeable_state: 'blocked' }] });
    await expect(autoMerge(test)).rejects.toThrow('deadline');
    expect(test.github.rest.pulls.merge).not.toHaveBeenCalled();
  });

  it('leaves missing checks unmerged when the deadline expires', async () => {
    const test = scenario({ checkRuns: [] });
    await expect(autoMerge(test)).rejects.toThrow('deadline');
    expect(test.github.rest.pulls.merge).not.toHaveBeenCalled();
  });

  it('does not merge a commit pushed after checks completed', async () => {
    const test = scenario({ states: [pr, { ...pr, head: { ...pr.head, sha: 'replacement-commit' } }] });
    await autoMerge(test);
    expect(test.github.rest.pulls.merge).not.toHaveBeenCalled();
  });

  it('does not merge against a base that changed after CI started', async () => {
    const test = scenario({ states: [{ ...pr, base: { ...pr.base, sha: 'changed-main' } }] });
    await autoMerge(test);
    expect(test.github.rest.pulls.merge).not.toHaveBeenCalled();
  });

  it('leaves changes requested by a human unmerged', async () => {
    const test = scenario({ reviews: [{ user: { id: 1 }, state: 'CHANGES_REQUESTED' }] });
    await expect(autoMerge(test)).rejects.toThrow('reviewer requested changes');
    expect(test.github.rest.pulls.merge).not.toHaveBeenCalled();
  });
});
