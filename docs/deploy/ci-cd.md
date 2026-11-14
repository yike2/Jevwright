# CI/CD

Every pull request and every push to `main` runs the CI workflow in `.github/workflows/ci.yml`. Pull requests that pass every test job are deployed to the preview environment, and pushes to `main` that pass are deployed to production. This guide explains the stages, the environments, the configuration they need, and how to deploy by hand when CI cannot.

## 1. Pipeline stages

| Stage | Jobs | Runs on | Starts after |
| ----- | ---- | ------- | ------------ |
| 1. Checks | Typecheck; Lint (ESLint and Prettier); Unit tests; Locator integration tests; Integration tests; Backend integration tests (with a Postgres service); Security scan (`pnpm audit --audit-level=high`) | Every PR and push to `main` | — |
| 2. Build | Frontend build (`next build`) | Every PR and push to `main` | Typecheck, Lint, Unit tests |
| 3. E2E | Playwright E2E suite against the built frontend (`next start`), the backend, and a Postgres service | Every PR and push to `main` | Frontend build |
| 4. Deploy | Deploy preview: the PR's commit to the preview environment (4) | PRs from branches of this repository | Every test job in stages 1–3 |
| 4. Deploy | Deploy to production: `main` to production (3) | Pushes to `main` only | Every test job in stages 1–3 |

Rules:

- The Security scan reports vulnerabilities but does not block merges yet, so a new advisory in a transitive dependency cannot stop all work. Its result is visible on every PR.
- A newer push to the same PR cancels the older run. Runs on `main` are never cancelled. At most one production deployment (concurrency group `deploy-production`) and one preview deployment (`deploy-preview`) are queued at a time, and on the server both take the lock `/tmp/jevwright-deploy.lock`, so only one of them builds at a time.
- When an E2E run fails, the Playwright report and traces are uploaded as the `playwright-report` artifact for 7 days.
- The E2E job uses throwaway values for `JWT_SECRET`, `OPENROUTER_API_KEY`, and the database password; its database exists only for the job, and the E2E tests never call Jev.

## 2. Environments

| Environment | Where | Configuration |
| ----------- | ----- | ------------- |
| Local | A developer's machine (`docs/deploy/backend-local.md`) | The repository's `.env` and `src/app/frontend/.env.local` |
| CI | GitHub Actions runners | Job-level `env` in `ci.yml`; no real secrets |
| Preview | The VPS, compose project `jevwright-preview` from its own checkout (4) | The preview checkout's `.env`; the GitHub environment `preview` |
| Production | The VPS (`docs/deploy/backend-prod.md`, `docs/deploy/frontend-prod.md`) | The server's `.env`; the GitHub environment `production` |

Preview and production share the server and production's Caddy, but nothing else: each has its own database, Runs volume, JWT secret, and domains.

## 3. Automatic deployment

The `Deploy to production` job:

1. Connects to the server over SSH with a key used only by GitHub Actions.
2. Refuses to deploy if the server's checkout has local changes, and prints them.
3. Fetches `main` and fast-forwards the checkout to the exact commit that passed CI.
4. Waits for the server's deploy lock, then builds the `browser`, `backend`, and `frontend` images one at a time with `docker compose build <service>`, because parallel builds run the VPS out of memory. If a build fails, the job stops and the running containers stay as they are.
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
5. `main` has no branch protection rules: by team agreement, a PR is merged only after its checks pass and, when the author asks, the partner reviews it. Production is still protected, because the deploy job needs every test job to pass.

To revoke the key, delete its line from the server's `~/.ssh/authorized_keys` and the `SSH_PRIVATE_KEY` secret.

## 4. Preview environment

The preview environment lets a reviewer try a PR in a browser before it is merged. It is a single slot: each deployment replaces the previous one, so it always shows the most recently updated PR.

| Part | Value |
| ---- | ----- |
| Frontend | `https://<PREVIEW_APP_DOMAIN>`, linked as "View deployment" on the PR |
| API | `https://<PREVIEW_API_DOMAIN>/api/v1` |
| Services | `compose.preview.yaml`: `preview-postgres`, `preview-backend`, `preview-browser` (1 GB, 1 CPU), `preview-frontend` |
| Checkout | A second clone on the server, e.g. `/home/deploy/Jevwright-preview` |
| Routing | Production's Caddy (`Caddyfile`) proxies the two preview domains to `preview-frontend` and `preview-backend` over the external network `jevwright-edge`. Production's own services are not on that network, so their names never resolve to preview containers. While no preview runs, the preview domains answer `502` |

The `Deploy preview` job fetches the PR's branch into the preview checkout and checks out the PR's exact commit. After taking the server's deploy lock, it builds `preview-browser`, `preview-backend`, and `preview-frontend` one at a time, runs `docker compose -p jevwright-preview -f compose.preview.yaml up -d`, removes dangling images, and waits until `/api/v1/health` answers inside `preview-backend`. That check does not depend on Caddy.

Data in the preview environment is disposable. Users registered there do not exist in production, and the next deployment keeps the database but may run another branch's migrations; reset it with `docker compose -p jevwright-preview -f compose.preview.yaml down -v` in the preview checkout.

### 4.1 Secrets and variables

Set these in **Settings → Environments → preview**, with deployment branches left unrestricted so PR branches can deploy:

| Name | Kind | Value |
| ---- | ---- | ----- |
| `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS` | Secret | The same values as in `production` (3.1) |
| `DEPLOY_PATH` | Variable | The absolute path of the preview checkout |
| `APP_URL` | Variable | `https://<PREVIEW_APP_DOMAIN>` |

Any branch pushed to this repository can use these secrets, so only collaborators with push access can trigger a preview deployment; PRs from forks are never deployed.

### 4.2 One-time setup

On the server:

1. Create the shared network: `docker network create jevwright-edge`.
2. Add the preview domains to production's `.env`; the next production deployment recreates Caddy with them:

   ```sh
   PREVIEW_APP_DOMAIN=preview.example.com
   PREVIEW_API_DOMAIN=preview-api.example.com
   ```

3. Clone a second checkout and give it its own `.env` with new secrets:

   ```sh
   git clone https://github.com/yike2/Jevwright.git /home/deploy/Jevwright-preview
   cd /home/deploy/Jevwright-preview
   cat > .env <<EOF
   API_DOMAIN=preview-api.example.com
   CORS_ORIGIN=https://preview.example.com
   POSTGRES_PASSWORD=$(openssl rand -hex 24)
   JWT_SECRET=$(openssl rand -hex 32)
   OPENROUTER_API_KEY=<the same key as production>
   EOF
   chmod 600 .env
   ```

Then create the `preview` environment in GitHub (4.1).

## 5. Deploying by hand

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

## 6. When something goes wrong

| Symptom | Check |
| ------- | ----- |
| Deploy fails at "refusing to deploy" | Someone changed files on the server. Inspect them with `git status` and `git diff` there, move wanted changes into a PR, then `git restore` the checkout |
| A build step fails with `Killed` or exit code `137` | The server ran out of memory during the build. Check `free -h` and `sudo dmesg -T \| grep -i oom`; add swap or stop other memory users, then rerun the job |
| Deploy fails at `git merge --ff-only` | The server's `main` has commits that are not on GitHub; reset it to `origin/main` after saving anything needed |
| `Permission denied (publickey)` | The public key is missing from the server's `authorized_keys`, or `SSH_PRIVATE_KEY` was pasted without its first and last lines |
| `Host key verification failed` | `SSH_KNOWN_HOSTS` is empty or the server was rebuilt; copy the host key line again (3.2) |
| The health check fails after a successful build | `docker compose logs backend` on the server |
| The preview deployment fails with `network jevwright-edge ... not found` | Create the network once (4.2) |
| The preview link answers `502` | No preview is running, or production's Caddy has not been recreated since the preview domains were added (4.2) |
| The preview frontend gets CORS errors | The preview `.env`'s `CORS_ORIGIN` must be exactly `https://<PREVIEW_APP_DOMAIN>` |
| E2E fails only in CI | Download the `playwright-report` artifact and open the trace with `pnpm exec playwright show-trace` |