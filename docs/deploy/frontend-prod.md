# Deploying the Frontend to a Server

This guide adds the Jevwright frontend at `https://<APP_DOMAIN>` to a server already set up with `backend-prod.md`. It uses the `frontend` service in `compose.yaml`, the frontend site in `Caddyfile`, and `src/app/frontend/Dockerfile`.

## What runs

| Service | What it does | Reachable from |
| ------- | ------------ | -------------- |
| `frontend` | The Next.js app, served by `next start` on port 3000 | `caddy` only; no port is published |
| `caddy` | Also serves HTTPS for `APP_DOMAIN` and proxies it to `frontend:3000` | The internet, ports 80 and 443 |

The browser talks to the API directly at `https://<API_DOMAIN>/api/v1`; the frontend never proxies API calls.

## 1. Configure

Add to `.env`, next to the backend's variables:

| Variable | Value |
| -------- | ----- |
| `APP_DOMAIN` | The frontend's domain, without `https://`, e.g. `app.example.com` |
| `CORS_ORIGIN` | Must be exactly `https://<APP_DOMAIN>`, with no trailing slash |

Without a domain, sslip.io names work for every site, since they resolve to the IP they contain: `api.<IP>.sslip.io`, `demo.<IP>.sslip.io`, and `app.<IP>.sslip.io`.

The API URL is not a runtime variable. Next.js writes `NEXT_PUBLIC_API_URL` into the JavaScript at build time, so compose passes `https://${API_DOMAIN}/api/v1` as a build argument. After changing `API_DOMAIN`, rebuild the frontend: `docker compose up -d --build frontend`.

## 2. Start it

```sh
docker compose up -d --build
docker compose ps
docker compose logs frontend
```

`frontend` logs `Ready` when `next start` is listening.

## 3. Check it

```sh
curl -I https://app.example.com/login   # 200
```

Then open `https://<APP_DOMAIN>` in a browser, register, and check that the home page shows the account's email.

## 4. The image

`src/app/frontend/Dockerfile` builds from the repository root, since pnpm's workspace and lockfile live there:

- Node 22 (`node:22.23.2-bookworm-slim`, as the backend) with corepack's pinned pnpm.
- `pnpm install --frozen-lockfile --ignore-scripts`; the root `prepare` script needs git, which the image does not have.
- `next build` with the `NEXT_PUBLIC_API_URL` build argument, then `next start` as the unprivileged `node` user.
- `.dockerignore` keeps `.env*`, `node_modules`, and `.next` out of the build context.

To test the image on your own machine:

```sh
docker build -f src/app/frontend/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=http://127.0.0.1:4000/api/v1 \
  -t jevwright-frontend .
docker run --rm -p 127.0.0.1:3000:3000 jevwright-frontend
```

## 5. Update

Same as `backend-prod.md` 8: `git pull`, then `docker compose up -d --build`.

## 6. When something goes wrong

| Symptom | Check |
| ------- | ----- |
| The browser shows CORS errors | `CORS_ORIGIN` must equal `https://<APP_DOMAIN>`; restart the backend with `docker compose up -d backend` after changing it |
| Requests go to the wrong API | `NEXT_PUBLIC_API_URL` is fixed at build time; rebuild with `docker compose up -d --build frontend` |
| Caddy answers `502` for `APP_DOMAIN` | The frontend is not running: `docker compose logs frontend` |
| `cannot expose privileged port 80` when Caddy starts | Docker runs rootless and may not bind ports below 1024; as root, set `net.ipv4.ip_unprivileged_port_start=80` in `/etc/sysctl.d/` and run `sysctl --system` |