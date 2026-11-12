# Deploying the Demo App

The Demo App is Swag Labs, a small shopping site for test automation practice, with our extra pages for dialogs, tabs, and menus (`docs/tech/benchmark.md` 1.2). It is a static site in the repository, `src/tests/benchmark/demo-app/site/` and `extras/`, served by Caddy with HTTPS at a public domain such as `https://demo.example.com`. Anyone can open it in a browser, and Jevwright's cloud Runs, which refuse private addresses, test it there.

There are two ways to deploy it:

- **With the whole platform**: `docs/deploy/backend-prod.md` already includes it; set `DEMO_DOMAIN` there and skip this guide.
- **On its own**: follow this guide, for example before the backend is ready or on a different server. It needs only Docker; no backend, database, or build step.

Both use the same Caddy site, `demo-app.Caddyfile` at the repository root, which serves the files like `pnpm benchmark` does locally: our pages under `/extras/`, the build everywhere else, and `index.html` for the app's own routes such as `/inventory.html`.

## 1. Prepare

You need:

- A server with Docker (`docs/deploy/backend-prod.md` 2 installs it on Ubuntu) and ports 80 and 443 open (`docs/deploy/backend-prod.md` 1).
- A domain for the Demo App, such as `demo.example.com`, with an `A` record pointing to the server's public IPv4 address (and an `AAAA` record for IPv6). Caddy cannot get a certificate until the record resolves; check with `dig +short demo.example.com`.

Get the repository:

```sh
sudo mkdir -p /opt/jevwright && sudo chown "$USER" /opt/jevwright
git clone https://github.com/yike2/Jevwright.git /opt/jevwright
cd /opt/jevwright
```

## 2. Start it

Replace `demo.example.com` with your domain:

```sh
cd /opt/jevwright
docker run -d --name jevwright-demo --restart unless-stopped \
  -p 80:80 -p 443:443 -p 443:443/udp \
  -e DEMO_DOMAIN=demo.example.com \
  -v "$PWD/demo-app.Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v "$PWD/src/tests/benchmark/demo-app/site:/srv/demo/site:ro" \
  -v "$PWD/src/tests/benchmark/demo-app/extras:/srv/demo/extras:ro" \
  -v jevwright-demo-data:/data \
  caddy:2.11.2-alpine
```

Caddy gets the certificate within a minute; `docker logs jevwright-demo` shows it (`certificate obtained successfully`). The `jevwright-demo-data` volume keeps the certificate across restarts. `--restart unless-stopped` starts the container again after a reboot.

## 3. Check it

```sh
curl -I https://demo.example.com/                     # 200
curl -I https://demo.example.com/inventory.html       # 200, the app's own route
curl -I https://demo.example.com/extras/dialogs.html  # 200, one of our extra pages
```

Open `https://demo.example.com` in a browser: the Swag Labs sign-in page lists the usernames and the password.

To check it with Jevwright itself, run the benchmark's selector Flows against it from any machine with the repository (`README.md`, Getting started); they call no Jev:

```sh
BASE=https://demo.example.com pnpm jevwright run src/tests/benchmark/suite/selector
# 15 files: 15 passed, 0 failed, 0 invalid
```

`SWAG_PASSWORD` must be set in `.env` or the environment for this, to the password on the sign-in page.

## 4. Use it in Jevwright

Test files reach the Demo App through two Project Variables, set in the frontend or with `PUT /api/v1/projects/<projectId>/variables/<name>`:

| Variable | Value |
| -------- | ----- |
| `BASE` | `https://demo.example.com` |
| `SWAG_PASSWORD` | The password on the Demo App's sign-in page |

Every file in `src/tests/benchmark/suite/` uses exactly these, so it runs unchanged as an uploaded Test File. `selector/` locates with CSS selectors only; `target/` describes the same elements in plain words for Jev to find, which shows what Jevwright adds. A Run whose first step fails with `net::ERR_FAILED` has a `BASE` on a private address such as `localhost`.

## 5. Update, stop, or move

- **Update**: `cd /opt/jevwright && git pull`. Caddy serves the files straight from the checkout, so changes are live at once, without a restart.
- **Stop**: `docker stop jevwright-demo`; start again with `docker start jevwright-demo`.
- **Move to the whole platform** on the same server: the platform's Caddy serves the Demo App too and needs ports 80 and 443, so remove this container first with `docker rm -f jevwright-demo`, then follow `docs/deploy/backend-prod.md` with the same `DEMO_DOMAIN`.

## 6. Preview it locally

The same container serves plain HTTP on a local port when `DEMO_DOMAIN` is a port instead of a domain:

```sh
docker run --rm --name jevwright-demo-local -p 127.0.0.1:8080:8080 \
  -e DEMO_DOMAIN=:8080 \
  -v "$PWD/demo-app.Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v "$PWD/src/tests/benchmark/demo-app/site:/srv/demo/site:ro" \
  -v "$PWD/src/tests/benchmark/demo-app/extras:/srv/demo/extras:ro" \
  caddy:2.11.2-alpine
```

It is at `http://127.0.0.1:8080`. A local backend reaches it only in dev mode (`pnpm backend`, `docs/tech/backend.md` 1.6), since Runs otherwise refuse local addresses.

## 7. When something goes wrong

| Symptom | Check |
| ------- | ----- |
| `docker run` fails with `port is already allocated` | Another web server uses port 80 or 443, such as the platform's own Caddy, which already serves the Demo App |
| No certificate, or the browser warns | `docker logs jevwright-demo`: the DNS record must point to this server, and ports 80 and 443 must be open |
| A blank page | The paths in the `-v` options must point to the checkout; run the command from `/opt/jevwright` |
| `toomanyrequests` while pulling | Docker Hub's pull limit; wait, or `docker login` with a free account |
