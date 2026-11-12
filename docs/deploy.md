# Deploying Jevwright

This guide takes a fresh VPS to a running Jevwright backend at `https://<API_DOMAIN>`. It uses the repository's `compose.yaml`, `Caddyfile`, and the two Dockerfiles in `src/app/backend/`; `docs/tech/backend.md` 1.6 and 1.9 explain why they look the way they do.

## What runs

| Service | What it does | Reachable from |
| ------- | ------------ | -------------- |
| `caddy` | HTTPS for `API_DOMAIN`, with automatic certificates; proxies to the backend, WebSockets included | The internet, ports 80 and 443 |
| `backend` | REST API, Run Queue, Live Progress; runs database migrations at start | `caddy` only |
| `browser` | The Chromium that Runs drive. Its firewall refuses every connection to a private address, so a user's test cannot reach Postgres, the backend, or the host | `backend` only |
| `postgres` | The database | `backend` only; no port is published |

Data lives in Docker volumes: `postgres-data` (the database), `runs` (screenshots, traces, reports), and `caddy-data` (certificates).

## 1. Prepare the server

You need:

- A VPS with Ubuntu 24.04, at least 2 CPUs and 4 GB of memory, and root or sudo access.
- A domain for the API, such as `api.example.com`, and later one for the frontend, such as `app.example.com`.

At your DNS provider, add an `A` record for the API domain pointing to the VPS's public IPv4 address (and an `AAAA` record if the VPS has IPv6). Caddy cannot get a certificate until this record resolves.

Open SSH, HTTP, and HTTPS in the host firewall:

```sh
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443
sudo ufw enable
```

## 2. Install Docker

Install Docker Engine and the compose plugin from Docker's own repository (Ubuntu's `docker.io` package is older):

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"   # log out and back in for this to apply
```

Check it with `docker run --rm hello-world` and `docker compose version`.

The `browser` container sets its firewall with `iptables`, so it needs the `NET_ADMIN` capability (granted in `compose.yaml`) and a kernel with nf_tables, which Ubuntu has. Some container-only hosting (for example, OpenVZ or LXC plans) does not allow this; a normal KVM VPS does.

## 3. Get the code and configure it

```sh
sudo mkdir -p /opt/jevwright && sudo chown "$USER" /opt/jevwright
git clone https://github.com/yike2/Jevwright.git /opt/jevwright
cd /opt/jevwright
cp .env.example .env
chmod 600 .env
```

Edit `.env`. compose reads it from this folder; the deploy needs these variables, and the others in the file are for local development:

| Variable | Value |
| -------- | ----- |
| `API_DOMAIN` | The API's domain, without `https://`, e.g. `api.example.com` |
| `CORS_ORIGIN` | The frontend's origin, with `https://`, e.g. `https://app.example.com`. Only this origin may call the API from a browser |
| `POSTGRES_PASSWORD` | A new random password: `openssl rand -hex 24` |
| `JWT_SECRET` | A new random secret of at least 32 characters: `openssl rand -hex 32`. Changing it logs every user out |
| `OPENROUTER_API_KEY` | The OpenRouter key Runs use for Jev |
| `RUN_CONCURRENCY` | Runs at a time, 1–8; keep `1` unless `docker stats` shows memory to spare. The `browser` service is limited to 2 GB of memory and 1.5 CPUs in `compose.yaml`; raise `mem_limit` and `cpus` there with it, about 1 GB per extra Run |

Leave `DATABASE_URL`, `RUNS_DIR`, `PORT`, and `BROWSER_ENDPOINT` unset; compose sets them. compose refuses to start when a required variable is missing.

## 4. Start it

```sh
docker compose up -d --build
docker compose ps
docker compose logs -f backend   # Ctrl+C to stop following
```

The first build downloads the Playwright image and takes a few minutes. When it is done, `backend` logs `All migrations have been successfully applied` and `Backend on http://localhost:4000/api/v1`, and `browser` logs `Listening on ws://0.0.0.0:3000/`.

## 5. Check it

```sh
curl https://api.example.com/api/v1/health
# {"status":"ok"}
```

The API docs are at `https://api.example.com/api/v1/docs`. Register a first user to check the database:

```sh
curl -X POST https://api.example.com/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"a long password"}'
```

Check that the browser cannot reach the private network. The first request must be refused, the second must answer `200`:

```sh
docker compose exec -u pwuser browser node -e '
for (const url of ["http://backend:4000/api/v1/health", "https://example.com/"])
  fetch(url).then((res) => console.log(url, res.status), (error) => console.log(url, "refused:", error.cause?.code));'
```

## 6. Frontend and Demo App

The frontend and the public Demo App get their own services in `compose.yaml` and their own sites in `Caddyfile`, next to the API's. Keep these rules:

- The frontend's origin must equal `CORS_ORIGIN`; after changing it, run `docker compose up -d backend`.
- Live Progress uses a WebSocket at `wss://<API_DOMAIN>/api/v1/runs/<runId>/live?token=<jwt>`; Caddy already passes WebSockets through.
- Runs refuse private addresses, so the Demo App must be served at a public URL, such as `https://demo.example.com`, and tests reach it through the Project Variable `BASE`. A Demo App on `localhost` or a container name is refused.

## 7. Update

```sh
cd /opt/jevwright
git pull
docker compose up -d --build
```

The backend applies new migrations when it starts. Runs that were queued or running during the restart are marked `failed` with the error `interrupted`, so update when no Runs are running.

## 8. Back up and restore

Back up the database every day and copy the file off the server; the VPS is not a backup. As a cron job (`crontab -e`):

```sh
0 3 * * * cd /opt/jevwright && docker compose exec -T postgres pg_dump -U jevwright -Fc jevwright > /opt/jevwright-backups/jevwright-$(date +\%F).dump
```

Create `/opt/jevwright-backups` first, copy its files elsewhere (for example with `rsync` or object storage), and delete old ones as you see fit.

To restore a dump:

```sh
docker compose stop backend
docker compose exec -T postgres pg_restore -U jevwright -d jevwright --clean --if-exists --no-owner < jevwright-2026-11-11.dump
docker compose start backend
```

The `runs` volume holds every Run's screenshots and traces. They are never deleted automatically; watch the disk with `docker system df -v` and back the volume up too if you need old screenshots.

## 9. When something goes wrong

| Symptom | Check |
| ------- | ----- |
| `browser` restarts in a loop, or Runs fail with an infrastructure error | `docker compose logs browser`. An `iptables` error means the host does not allow `NET_ADMIN` or nf_tables (step 2); the container stops instead of running without its firewall |
| Caddy has no certificate | `docker compose logs caddy`. The DNS record must point to this server, and ports 80 and 443 must be open |
| The frontend gets CORS errors | `CORS_ORIGIN` must be exactly the frontend's origin, with `https://` and no trailing slash |
| `backend` exits at start | Its log names the missing or invalid variable (`Invalid environment`) or the failed migration |
| `toomanyrequests` while building | Docker Hub's pull limit; wait, or run `docker login` with a free account |
| Every user is logged out | `JWT_SECRET` changed |
