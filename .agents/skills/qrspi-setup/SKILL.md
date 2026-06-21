---
name: qrspi-setup
description: Set up the QRSPI thoughts system in a repository by creating the local thoughts/shared directory structure and adding thoughts/ to .gitignore. Use when initializing QRSPI, bootstrapping thoughts/shared folders, replacing the old HumanLayer thoughts setup, or when QRSPI skills fail because thoughts/ does not exist.
disable-model-invocation: true
---

# Setup QRSPI

Initialize the local `thoughts/` metadata workspace that the QRSPI skills use for tickets, research questions, research, design discussions, structure outlines, plans, and handoffs.

This skill replaces the old HumanLayer CLI bootstrap path. Do not require `humanlayer` just to create the thoughts system.

## Contract

- QRSPI artifacts live under `thoughts/shared/<stage>/`.
- `thoughts/` is ignored by git by default.
- HumanLayer sync/indexing is optional; this setup only creates the local workspace.

## Default behavior

Run the bundled setup script from the repository root:

```bash
bash skills/qrspi/qrspi-setup/scripts/setup-thoughts.sh
```

If the skill is installed outside this repository and the script path is unavailable, perform the equivalent steps manually:

```bash
mkdir -p thoughts/shared/{tickets,questions,research,design,structure,plans,handoffs}
printf '\n# QRSPI local metadata\nthoughts/\n' >> .gitignore
```

Then deduplicate `.gitignore` so `thoughts/` appears once.

## What to create

Create this directory structure:

```text
thoughts/
  shared/
    tickets/
    questions/
    research/
    design/
    structure/
    plans/
    handoffs/
```

## Git behavior

- Add `thoughts/` to the target repository's top-level `.gitignore`.
- Keep QRSPI outputs local by default; do not commit generated planning documents unless the user explicitly asks.
- Do not add `.gitkeep` files under `thoughts/` because the entire tree is ignored.

## Verification

Before reporting success:

1. Confirm the current directory is the intended repository root, or state the path you initialized.
2. Verify `thoughts/shared/plans/` exists.
3. Verify `.gitignore` contains `thoughts/`.

Example verification command:

```bash
test -d thoughts/shared/plans && grep -qx 'thoughts/' .gitignore
```

## If a project already uses a different convention

If the repository already has `thoughts/` tracked or uses a shared docs directory instead:

1. Stop before overwriting or deleting anything.
2. Report the existing convention.
3. Ask whether to keep the existing convention or migrate to ignored local `thoughts/`.
