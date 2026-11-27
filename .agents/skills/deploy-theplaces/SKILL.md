---
name: deploy-theplaces
description: >-
  Safely deploy, verify, back up, or roll back A View on Ubuntu (theplaces.online)
  using scripts/deploy.sh, Caddy, systemd, and SQLite WAL backups. Use when
  deploying releases, editing scripts/deploy.sh or deploy/*, or performing host
  backups and recovery.
---

# Deploying & Operating `theplaces.online`

Production runs on one Ubuntu host (`Caddy` TLS proxy → `127.0.0.1:4173` Node 24
systemd service → `/var/lib/a-view/world.sqlite`).

## 1. Pre-Deploy Safety Checks

`scripts/deploy.sh deploy` packages the **current working tree** (`package.json`,
`src/`, `shared/`, `public/` excluding `public/dev/`), **including uncommitted
edits**. Always verify before running:

```sh
git status -sb
bash -n scripts/deploy.sh deploy/*.sh && shellcheck scripts/deploy.sh deploy/*.sh
npm run check
npm test
node --test test/deploy.test.js
```

Confirm:
- Working tree is clean (or only contains intentional release changes).
- No symbolic links exist under `src/`, `shared/`, or `public/` (`deploy.sh`
  aborts if any are found).
- If `src/store.js` bumps the world schema version, confirm you have an off-host
  SQLite backup first (older code cannot open a migrated database).

## 2. Deployment Commands

Run from the repository root with your SSH target or config alias:
```sh
bash scripts/deploy.sh setup YOUR_SSH_TARGET     # first-time host setup or Node update
bash scripts/deploy.sh deploy YOUR_SSH_TARGET    # check, upload, backup DB, activate, health-check
bash scripts/deploy.sh status YOUR_SSH_TARGET    # inspect systemd services and local health
bash scripts/deploy.sh backup YOUR_SSH_TARGET    # run an immediate online SQLite backup
bash scripts/deploy.sh rollback YOUR_SSH_TARGET  # swap current <-> previous app release
```
- Pin Node version on setup with `NODE_VERSION=24.x.y`; `setup` does not restart
  a running app (follow with `deploy`).
- `deploy` automatically backs up `/var/lib/a-view/world.sqlite` before switching
  the `/opt/a-view/current` symlink and checks `/` and `/api/world`. On failure it
  restores the previous release (and the pre-activation backup if a migration made
  the DB unreadable to the previous release, saving replaced files under
  `/var/backups/a-view/failed-activation-*`).

## 3. Post-Deploy Verification

```sh
curl -I http://theplaces.online
curl -I https://theplaces.online
curl --fail --silent --show-error https://theplaces.online/api/world
curl --no-buffer --max-time 6 https://theplaces.online/api/stream
curl -I https://theplaces.online/dev/sky-study.html
```
Expected results:
- HTTP `308` redirect to HTTPS; `200` over HTTPS
- Valid JSON snapshot from `/api/world`
- Repeated `data:` SSE frames every ~2 s (exits with curl code `28` at 6 s)
- HTTP `404` on `/dev/sky-study.html` (blocked both by Caddy and `NODE_ENV=production`)

On the host if investigating issues:
```sh
sudo journalctl -u a-view -n 100 --no-pager
sudo journalctl -u caddy -n 100 --no-pager
sudo systemctl list-timers a-view-backup.timer
```

## 4. SQLite WAL Backup & Rollback Rules

- **Never copy `world.sqlite` directly with `cp`/`scp`** while the app runs;
  committed data may live in `-wal`. Always use SQLite's online backup API:
  ```sh
  sqlite3 data/world.sqlite ".backup '/tmp/a-view-snapshot.sqlite'"
  ```
- `rollback` swaps **application releases only**; it does **not** rewind world
  state. Rolling back across a breaking schema migration requires restoring a
  compatible backup using the locked restore procedure in `docs/deployment.md`.
- Node must remain bound strictly to `127.0.0.1:4173` (never open port 4173 in
  UFW or provider firewalls).
