# 🐸 Bumpy

This directory is used by [bumpy](https://bumpy.varlock.dev) to manage versioning and changelogs.

Bumpy is a modern versioning tool for JavaScript/TypeScript projects (monorepos and single packages). It uses **bump files** — small markdown files in this directory — to declare pending version changes. These files are consumed during the release process to compute version bumps, update changelogs, and publish packages.

## How it works

1. When you make a change that should trigger a release, create a bump file (typically one per PR)
2. Bump files accumulate on your main branch until you're ready to release
3. At release time, bumpy merges all pending bumps into a release plan, updates versions and changelogs, and publishes packages

## Creating bump files

### Interactive

```bash
pnpm bumpy add
```

### Non-interactive (useful for AI-assisted development)

```bash
pnpm bumpy add --packages "package-name:minor,other-package:patch" --message "Description of changes" --name "my-change"
```

### By hand

Create a `.md` file in this directory with YAML frontmatter mapping package names to bump levels (`major`, `minor`, `patch`, or `none`), and a markdown body for the changelog entry:

```markdown
---
'package-name': minor
---

Added a new feature.
```

### From conventional commits

```bash
pnpm bumpy generate
```

### Empty bump files

For PRs that intentionally don't need a release (docs, CI, etc.):

```bash
pnpm bumpy add --empty --name "docs-update"
```

## Keeping bump files up to date

As a PR evolves, make sure its bump file stays in sync. If the scope of changes grows (e.g., a patch becomes a new feature), update the bump level and description to match. Reviewers and AI assistants should treat the bump file as part of the PR — just like tests and docs.

## Files in this directory

- `_config.json` — bumpy configuration
- `README.md` — this file
- `*.md` (other than README.md) — pending bump files

📖 Full documentation: https://bumpy.varlock.dev
## Project conventions

Follow `AGENTS.md` for this project's commands and release workflow. Use
`pnpm run release:add -- ...` to create bumps. Record changes during development;
do not reconstruct them from commits at release time.

Maintain one bump per logical change and commit it with the implementation,
tests, and consumer documentation.

### Explain the consumer-visible change

The body becomes a changelog entry. Explain what changes for someone using the
package. Demonstrate it when an example communicates more clearly than prose:

- Syntax or API changes: show before and after, with necessary migration steps.
- New capabilities: show representative usage and its result.
- Fixes: describe the affected case and corrected behavior.

Use only the structure the change needs. A clear sentence can be sufficient;
headings and code blocks are not mandatory.

Examples must match the implementation and an executable test or fixture.
Use real inputs and outputs. Avoid invented APIs, omitted load-bearing steps,
and claims broader than the evidence. Link to evidence when useful, using a
repository URL that remains valid from the generated changelog.

Avoid file inventories, internal work logs, test counts, and claims such as
"production ready." Bumpy checks release coverage; reviewers assess whether
the description accurately explains the change.
