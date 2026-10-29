# Agent instructions

Read `docs/requirements.md` and `docs/specification.md` before changing the package.
Use `docs/implementation-plan.md` for the build order. Keep dependency findings in
`docs/research.md` and cite the official usage or public API that supports each finding.

Build the core first. Keep it independent of UI frameworks and generation providers.
Use library affordances directly. Compare supported compositions before adding code.
Define types and validation with ArkType `type.module` and derive types with `infer`.
Core operations receive valid data. Add error handling only for an established need.
Do not add a configuration UI or operational infrastructure.

Use Type Atlas for TypeScript navigation. Use Vite+ for package and build commands.
Write documentation with ASD-STE100 rules. Documents define the product and its
contracts; they must not contain conversation history or agent progress narration.
# Agent Workflow

## Shared branches

- Daily branch: `main`
- Bumpy base branch: `release`
- Generated version PR: `bumpy/version-packages`

The human owns the checked-out branch. Agents never create, switch, rename, delete,
reset, or replace branches unless the human explicitly requests that exact
operation. If a session starts on another branch, continue there and report the
difference; never “correct” it by switching.

## Closed distribution commands

Every CI, repository setup, branch promotion, release, trust, publication,
verification, and recovery operation uses a named root `package.json` script,
invoked bare (`pnpm run <script>` plus the script's own arguments) — never
piped, grepped, wrapped, timed out, fed input, or looped. Never run the
underlying `gh`, `bumpy`, `fledgling`, `npm`, or distribution-related `git`
command directly, and never improvise a shell pipeline, watcher, wrapper, or
alternate command. If the required operation has no script, stop before
performing it and repair the project command contract first. Never assert
that the user must perform a step: the agent runs everything, and a genuinely
blocked command is reported as the specific gate (a login prompt or a runtime
permission), not converted into a user task. Read-only Git inspection and
local commits remain ordinary development actions.

## Daily changes

- Work and commit on the currently checked-out branch.
- Stage only files owned by the current task; preserve parallel agents’ changes.
- Inspect the index before committing. When another agent already staged files,
  use `git commit --only -- <task-owned paths>` and leave those staged entries
  untouched.
- If Git reports `index.lock`, wait for the other Git operation; never delete it.
- A request to `commit` authorizes a local commit only.
- A request to `push` authorizes pushing the currently checked-out branch and
  its complete unpushed commit set through the applicable named script.
- Consumer-visible package changes include one maintained Bumpy bump file.
- Follow `node_modules/@varlock/bumpy/skills/add-change/SKILL.md` for bump level
  and changelog text.
- Follow `.bumpy/README.md` for consumer-facing explanations and practical examples.
- Do not create task-specific branches or worktrees.

## Bump lifecycle

Bumps are authored during change development, never reconstructed just before
release. The first commit for a consumer-visible logical change creates one bump
file through `pnpm run release:add -- ...`; later commits for that same change
update the same file. An unrelated logical change gets its own bump file.

Commit the implementation, tests, generated consumer docs, and bump file
together. Use patch for compatible fixes, minor for compatible capabilities,
and major for breaking public contracts. Name only directly changed packages;
Bumpy owns fixed-group and dependency propagation. Root shared changes name
every affected public package explicitly. Internal changes that require a
version but no changelog use `$changelog: false` through the bundled add-change
guidance.

Before every commit, decide whether the task-owned diff changes published
behavior, API, runtime dependencies, executables, generated artifacts, or
consumer documentation. If it does, the bump belongs in that commit. A release
request consumes pending bump files; it never creates them retroactively.

Before pushing the daily branch, report every commit not yet on
`origin/main`. Bump files accumulate there; pushing it does not
invoke Bumpy's release workflow.

If the push is rejected because the remote advanced, never force-push or rebase.
When the worktree is clean and no parallel agent has uncommitted work, merge
`origin/main` into the checked-out daily branch, then push once.

## Release

Only an explicit `release` request authorizes integrating the daily branch into
the Bumpy base branch and merging the generated version PR.

The checked-out branch must equal `main`. If it does not, report
the mismatch and stop; never switch it on the human's behalf.

### Prepare one candidate

1. Run `pnpm run dependencies:list`. Resolve each dependency update. Run
   `pnpm run dependencies:sync` after a dependency merge.
2. Commit all intended changes and bump files. The worktree must be clean.
3. Run `pnpm run check`, `pnpm run release:check`, and
   `pnpm run release:preflight` in this order.
4. Correct each failure and restart this phase from step 2.
5. Report all unpushed commits. Run `pnpm run release:push`.
6. Wait for CI on this exact commit. If CI fails, read its failed log, correct
   the cause, and restart this phase from step 2.

This passing commit is the release candidate. Any later change creates a new
candidate and restarts this phase.

### Promote and publish

1. Run `pnpm run release:promote:pr` once. If no pull request exists, run
   `pnpm run release:promote:create` once.
2. Run `pnpm run release:promote:merge` once.
3. After GitHub reports that merge, run `pnpm run release:pr` once.
4. If the version pull request exists, run `pnpm run release:merge` once.
5. GitHub owns publication. Read failed logs only after GitHub reports failure.

Automated reviews are advisory. A finding that proves the candidate unsafe
restarts preparation. Other findings enter normal development after release.

### Verify and synchronize

1. After publication, run `pnpm run release:verify`.
2. On the clean working branch, run `pnpm run release:sync`. If fast-forward
   sync refuses, run `pnpm run release:sync:merge`.
3. Run `pnpm run release:sync:push`.
4. Run `pnpm run release:status`. It must show no pending bumps or releases.

The release is complete only when public verification succeeds,
synchronization succeeds, and the working branch is clean. Never rebase,
force-push, switch branches, edit generated release files, or publish locally.
