import { setTimeout as sleep } from 'node:timers/promises';

const ELIGIBLE_UPDATES = new Set(['version-update:semver-minor', 'version-update:semver-patch']);
const DEPENDENCY_FILES = new Set(['package.json', 'package-lock.json']);
const ACCEPTED_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);
/** Polls 15 s apart: about 15 minutes for CI to finish. */
const MAX_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 15_000;
/** The jobs of `.github/workflows/ci.yml`; each must have run and succeeded on the PR's head. */
export const REQUIRED_CHECKS = [
  { name: 'Verify library (Node 22)', app: 'github-actions' },
  { name: 'Verify library (Node 24)', app: 'github-actions' },
  { name: 'Examples in Chromium', app: 'github-actions' },
];

/** Missing, queued, skipped required, or failed checks never permit a merge. */
export function getCheckState(checkRuns, statuses, runId) {
  const checks = checkRuns.filter((check) => !check.details_url?.includes(`/actions/runs/${runId}/`));
  const latestStatuses = [...new Map(statuses.toReversed().map((status) => [status.context, status])).values()];
  if (checks.some((check) => check.status === 'completed' && !ACCEPTED_CONCLUSIONS.has(check.conclusion)) ||
      latestStatuses.some((status) => status.state === 'failure' || status.state === 'error')) {
    return 'failed';
  }
  const requiredPassed = REQUIRED_CHECKS.every((required) => checks.some((check) =>
    check.name === required.name && check.app?.slug === required.app &&
    check.status === 'completed' && check.conclusion === 'success'));
  return requiredPassed && checks.every((check) => check.status === 'completed') &&
    latestStatuses.every((status) => status.state === 'success')
    ? 'ready' : 'pending';
}

export function isUnchangedDependabotPR(pr, original, repository, defaultBranch) {
  return pr.state === 'open' && !pr.draft && !pr.merged &&
    pr.user.login === 'dependabot[bot]' && pr.head.repo?.full_name === repository &&
    pr.base.ref === defaultBranch && pr.head.sha === original.head.sha && pr.base.sha === original.base.sha;
}

export function hasBlockingReview(reviews) {
  const decisions = reviews.filter((review) => ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state));
  return [...new Map(decisions.map((review) => [review.user.id, review.state])).values()].includes('CHANGES_REQUESTED');
}

/** Merges a minor or patch npm update once every check on its exact head commit has passed. */
export default async function autoMerge({ github, context, core, updateType, wait = sleep }) {
  if (!ELIGIBLE_UPDATES.has(updateType)) {
    core.info('Major or unclassified update: manual review required.');
    return;
  }
  const original = context.payload.pull_request;
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  const defaultBranch = context.payload.repository.default_branch;
  const pull = { ...context.repo, pull_number: original.number };
  const files = await github.paginate(github.rest.pulls.listFiles, { ...pull, per_page: 100 });
  if (!files.length || files.some((file) => !DEPENDENCY_FILES.has(file.filename) || file.status !== 'modified')) {
    throw new Error('Only npm manifest and lockfile modifications can auto-merge.');
  }
  // Poll and recheck the same commit before merging.
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: pr } = await github.rest.pulls.get(pull);
    if (!isUnchangedDependabotPR(pr, original, repository, defaultBranch)) {
      core.info('PR identity, head, or base changed; leaving it for a fresh run.');
      return;
    }
    const ref = { ...context.repo, ref: original.head.sha, per_page: 100 };
    const [checks, statuses] = await Promise.all([
      github.paginate(github.rest.checks.listForRef, { ...ref, filter: 'latest' }),
      github.paginate(github.rest.repos.listCommitStatusesForRef, ref),
    ]);
    const state = getCheckState(checks, statuses, context.runId);
    if (state === 'failed') throw new Error('A check failed or was cancelled; leaving the update unmerged.');
    if (state === 'ready' && pr.mergeable === true && pr.mergeable_state === 'clean') {
      const reviews = await github.paginate(github.rest.pulls.listReviews, { ...pull, per_page: 100 });
      if (hasBlockingReview(reviews)) throw new Error('A reviewer requested changes; manual review required.');
      const { data: latest } = await github.rest.pulls.get(pull);
      if (!isUnchangedDependabotPR(latest, original, repository, defaultBranch)) return;
      const { data: result } = await github.rest.pulls.merge({
        ...pull, sha: original.head.sha, merge_method: 'squash',
      });
      if (!result.merged) throw new Error(result.message);
      core.info(`Merged Dependabot PR #${original.number} after all checks passed.`);
      return;
    }
    core.info(`Waiting for CI and mergeability (${attempt + 1}/${MAX_ATTEMPTS}).`);
    await wait(POLL_INTERVAL_MS);
  }
  throw new Error('Checks did not all pass before the deadline; leaving the update unmerged.');
}
