---
name: release-package
description: Record and release package changes through the repository's local Bumpy workflow.
---

# Release packages

Use only the repository's named root scripts for every release operation.
Never run their underlying `gh`, `bumpy`, `npm`, `fledgling`, or `git` commands
directly. A missing command is a project setup defect and must be added before
release continues.

For a consumer-visible package change, follow
`node_modules/@varlock/bumpy/skills/add-change/SKILL.md` and commit its bump file
with the implementation on the checked-out working branch. Pushing the working
branch only accumulates bump files; Bumpy creates or updates
`bumpy/version-packages` when the promotion merge reaches the base branch, and
nothing publishes until that generated PR merges.

Create the bump with the first consumer-visible commit for that logical change.
Update the same bump as the change evolves. Never wait for a release request to
reconstruct bumps from commit history.

An explicit release request authorizes this exact sequence:

```sh
pnpm run dependencies:list
pnpm run dependencies:sync # after a dependency pull request merges
pnpm run check
pnpm run release:check
pnpm run release:preflight
pnpm run release:push
```

Wait for CI on the exact pushed commit. If it fails, correct the cause and
restart from `check`. Do not promote a different or unverified commit.

```sh
pnpm run release:promote:pr
pnpm run release:promote:create # only when the previous command found no PR
pnpm run release:promote:merge
```

Return to useful work. After GitHub reports the promotion merge:

```sh
pnpm run release:pr
pnpm run release:merge
```

Run `release:merge` only when `release:pr` returned the version PR. Required
checks gate both merges. GitHub owns publication. After publication, run:

```sh
pnpm run release:verify
pnpm run release:sync
pnpm run release:sync:push
pnpm run release:status
```

The release is complete when public verification succeeds, synchronization
succeeds, no pending bump remains, and the working branch is clean.
