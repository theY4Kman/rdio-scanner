# rdio-scanner project memory

## Build & Restart

**Build** (rebuilds Docker image from source):
```bash
bash yak-build.sh
```
Runs from the repo root (`/home/they4kman/programming/third-party/rdio-scanner`).
Produces image `rdio-scanner:yak-latest`.

**Restart** (stops old container, starts fresh one):
```bash
bash ~/.rdio-scanner/restart.sh
```
Stops/removes the `rdio-scanner` container then calls `~/.rdio-scanner/start.sh`,
which runs the image on port 18181 with data volume at `~/.rdio-scanner/`.

**Typical deploy flow after code changes:**
```bash
bash yak-build.sh && bash ~/.rdio-scanner/restart.sh
```

## Repo layout

- `client/` — React/Vite frontend (TypeScript, MUI)
- `server/` — Go backend; built artifacts land in `server/webapp/`
- `yak-build.sh` — single-command Docker build (debug config)
- `~/.rdio-scanner/` — runtime data dir (DB, certs, start/restart scripts)

## Active branch

`yak/6.x` — primary fork branch.

## Commit policy

**Always commit your work before ending a session or handing control back to
the user.** Uncommitted work is work that doesn't exist — it disappears into
`git stash`, gets clobbered by the next task, or silently rots across context
resets. This is non-negotiable.

Rules:

1. **Commit as you go.** When a logical unit of work is done (a bugfix, a
   feature slice, a refactor), commit it right then. Don't accumulate a
   dozen unrelated changes in the working tree.
2. **Commit before context swaps.** Before starting an unrelated task, running
   a long investigation, or handing off to another agent/session, commit what
   you have. Even a `WIP: <one-line summary>` commit is better than stashing.
3. **One commit per concern.** Separate bugfix, feature, chore, and build
   changes into their own commits. If a diff touches multiple unrelated
   concerns, use `git add -p` to split them.
4. **Clear messages.** Conventional-commits style:
   `fix(scope): …`, `feat(scope): …`, `chore(scope): …`, `refactor(scope): …`.
   The subject describes WHAT changed; the body (when helpful) explains WHY.
5. **Pre-existing WIP is not your problem, but don't bury your own work in
   it.** If the tree already has unrelated WIP when you arrive, stage and
   commit YOUR changes in focused commits, and leave the pre-existing WIP
   where it is (or park it in a dedicated `WIP: …` commit separate from
   yours). Never fold your clean session work into an opaque WIP blob.
6. **Never amend or rebase commits you didn't create** without explicit user
   permission. The user's commit history is theirs.

If the user ends a conversation without you having committed, treat that as a
bug: flag it, commit, and then respond. Do not end turns with dirty working
trees unless the user explicitly said "don't commit".

