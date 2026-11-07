#!/usr/bin/env bash
# Rebuilds site/ from the pinned Swag Labs commit. Needs git and Node >= 24.9 (for example through nvm or
# Docker node:24), because the upstream app does; the repo itself stays on Node 22.
set -euo pipefail

UPSTREAM=https://github.com/saucelabs/sample-app-web.git
COMMIT=ad62bb2d7950bc5747af46a75aa1fb1bd6b8622a

here=$(cd "$(dirname "$0")" && pwd)
node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 24 || (major === 24 && minor < 9)) {
    console.error(`Node ${process.versions.node} is too old: Swag Labs needs Node >= 24.9 (try nvm or Docker node:24)`);
    process.exit(1);
  }
'

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git clone --quiet "$UPSTREAM" "$work/app"
git -C "$work/app" checkout --quiet "$COMMIT"

cp "$here/backtrace-stub.jsx" "$work/app/src/backtrace-stub.jsx"
cp "$here/vite.config.jevwright.mjs" "$work/app/vite.config.jevwright.mjs"
(cd "$work/app" && npm ci --ignore-scripts --no-audit --no-fund --loglevel=error &&
  VITE_CONFIG_NATIVE_IGNORE_WARNING=true npx vite build --config vite.config.jevwright.mjs --logLevel error)

# Every page links a Google Fonts stylesheet, a request outside localhost; without it the pages fall back to
# system fonts. Each link is a line of its own, also inside the template strings that fill shadow roots.
node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const link = /^\s*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/[^"]*">\s*$/;
  for (const name of fs.readdirSync(process.argv[1], { recursive: true }).filter((f) => f.endsWith(".html"))) {
    const file = path.join(process.argv[1], name);
    const html = fs.readFileSync(file, "utf8");
    const kept = html.split("\n").filter((line) => !link.test(line)).join("\n");
    if (kept.includes("fonts.googleapis.com")) throw new Error(`A Google Fonts reference is left in ${name}`);
    fs.writeFileSync(file, kept);
  }
' "$work/app/build"

rm -rf "$here/site"
cp -R "$work/app/build" "$here/site"
cp "$work/app/LICENSE" "$here/LICENSE"
echo "Built Swag Labs $COMMIT into $here/site"
