# CI/CD

Every pull request and every push to `main` runs the CI workflow in `.github/workflows/ci.yml`. Pushes to `main` that pass every test job are deployed to production automatically. This guide explains the stages, the configuration they need, and how to deploy by hand when CI cannot.

## 1. Pipeline stages

| Stage | Jobs | Runs on | Starts after |
| ----- | ---- | ------- | ------------ |
| 1. Checks | Typecheck; Lint (ESLint and Prettier); Unit tests; Locator integration tests; Integration tests; Backend integration tests (with a Postgres service); Security scan (`pnpm audit --audit-level=high`) | Every PR and push to `main` | — |
| 2. Build | Frontend build (`next build`) | Every PR and push to `main` | Typecheck, Lint, Unit tests |
| 3. E2E | Playwright E2E suite against the built frontend (`next start`), the backend, and a Postgres service | Every PR and push to `main` | Frontend build |
| 4. Deploy | Deploy to production over SSH, then a health check | Pushes to `main` only | Every test job in stages 1–3 |

Rules:

- The Security scan reports vulnerabilities but does not block merges yet, so a new advisory in a transitive dependency cannot stop all work. Its result is visible on every PR.
- A newer push to the same PR cancels the older run. Runs on `main` are never cancelled, and at most one deployment runs at a time (concurrency group `deploy-production`).
- When an E2E run fails, the Playwright report and traces are uploaded as the `playwright-report` artifact for 7 days.
- The E2E job uses throwaway values for `JWT_SECRET`, `OPENROUTER_API_KEY`, and the database password; its database exists only for the job, and the E2E tests never call Jev.

## 2. Environments

| Environment | Where | Configuration |
| ----------- | ----- | ------------- |
| Local | A developer's machine (`docs/deploy/backend-local.md`) | The repository's `.env` and `src/app/frontend/.env.local` |
| CI | GitHub Actions runners | Job-level `env` in `ci.yml`; no real secrets |
| Production | The VPS (`docs/deploy/backend-prod.md`, `docs/deploy/frontend-prod.md`) | The server's `.env`; the deploy job's secrets and variables in the GitHub environment `production` |

## 3. Automatic deployment

The `Deploy to production` job:

1. Connects to the server over SSH with a key used only by GitHub Actions.
2. Refuses to deploy if the server's checkout has local changes, and prints them.
3. Fetches `main` and fast-forwards the checkout to the exact commit that passed CI.
4. Builds the `browser`, `backend`, and `frontend` images one at a time with `docker compose build <service>`, because parallel builds run the VPS out of memory. If a build fails, the job stops and the running containers stay as they are.
5. Restarts the changed services with `docker compose up -d` and prints `docker compose ps`.
6. Calls `<API_URL>/health` until it answers, for up to a minute.

The GitHub environment `production` shows each deployment and links to the frontend.

### 3.1 Secrets and variables

Set these in **Settings → Environments → production**:

| Name | Kind | Value |
| ---- | ---- | ----- |
| `SSH_HOST` | Secret | The server's address |
| `SSH_USER` | Secret | The deploy user |
| `SSH_PRIVATE_KEY` | Secret | The private key of the GitHub Actions deploy key (3.2) |
| `SSH_KNOWN_HOSTS` | Secret | The server's host key line, so the job never trusts an unknown host |
| `DEPLOY_PATH` | Variable | The absolute path of the checkout on the server |
| `APP_URL` | Variable | The frontend's URL, shown on deployments |
| `API_URL` | Variable | The API's base URL, ending in `/api/v1`, used for the health check |

### 3.2 One-time setup

1. Create a key used only by GitHub Actions, without a passphrase:

   ```sh
   ssh-keygen -t ed25519 -f ~/.ssh/jevwright_actions -N "" -C "github-actions@jevwright"
   ```

2. Allow it on the server, then check that it works:

   ```sh
   ssh-copy-id -i ~/.ssh/jevwright_actions.pub <user>@<host>
   ssh -i ~/.ssh/jevwright_actions -o IdentitiesOnly=yes <user>@<host> 'cd <DEPLOY_PATH> && docker compose ps'
   ```

3. Copy the server's host key line from a machine that already trusts the server: `ssh-keygen -F <host> | grep -v '^#'`.
4. Create the `production` environment, add the secrets and variables in 3.1, and limit its deployment branches to `main`.
5. In **Settings → Branches**, protect `main`: require a pull request with one approval, and require the status checks Typecheck, Lint, Unit tests, Locator integration tests, Integration tests, Backend integration tests, Frontend build, and E2E tests.

To revoke the key, delete its line from the server's `~/.ssh/authorized_keys` and the `SSH_PRIVATE_KEY` secret.

## 4. Deploying by hand

If the deploy job fails or GitHub Actions is down, deploy from the server:

```sh
cd <DEPLOY_PATH>
git status --short          # must print nothing
git checkout main && git pull
for service in browser backend frontend; do docker compose build "$service"; done
docker compose up -d
docker compose ps
```

Never deploy a branch that is not merged: production would no longer match `main`.

## 5. When something goes wrong

| Symptom | Check |
| ------- | ----- |
| Deploy fails at "refusing to deploy" | Someone changed files on the server. Inspect them with `git status` and `git diff` there, move wanted changes into a PR, then `git restore` the checkout |
| A build step fails with `Killed` or exit code `137` | The server ran out of memory during the build. Check `free -h` and `sudo dmesg -T \| grep -i oom`; add swap or stop other memory users, then rerun the job |
| Deploy fails at `git merge --ff-only` | The server's `main` has commits that are not on GitHub; reset it to `origin/main` after saving anything needed |
| `Permission denied (publickey)` | The public key is missing from the server's `authorized_keys`, or `SSH_PRIVATE_KEY` was pasted without its first and last lines |
| `Host key verification failed` | `SSH_KNOWN_HOSTS` is empty or the server was rebuilt; copy the host key line again (3.2) |
| The health check fails after a successful build | `docker compose logs backend` on the server |
| E2E fails only in CI | Download the `playwright-report` artifact and open the trace with `pnpm exec playwright show-trace` |