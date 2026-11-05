# Swag Labs demo app

`site/` is the static build of Swag Labs ([saucelabs/sample-app-web](https://github.com/saucelabs/sample-app-web)) at commit `ad62bb2d7950bc5747af46a75aa1fb1bd6b8622a`, under the MIT license in [`LICENSE`](LICENSE). The benchmark suite runs against it, served by [`../server.ts`](../server.ts).

The build differs from upstream in two ways, so the app makes no request outside localhost:

- `@backtrace/react` is replaced by [`backtrace-stub.jsx`](backtrace-stub.jsx), which reports nothing and keeps `ErrorBoundary`'s fallback.
- The Google Fonts stylesheet is removed from every page; the pages use system fonts.

`extras/` holds our own pages for what Swag Labs lacks: dialogs, a new tab, hover, right-click, and double-click. They are served under `/extras/` and are not part of the build.

## Rebuilding

`site/` is committed, so tests need no build. To rebuild it, for example after changing the pinned commit in `build.sh`, run with Node 24.9 or later:

```bash
nvm exec 24 bash src/tests/benchmark/demo-app/build.sh
# or
docker run --rm -v "$PWD":/repo -w /repo node:24 bash src/tests/benchmark/demo-app/build.sh
```

The script clones the pinned commit, builds it with the stub, strips the font links, and replaces `site/` and `LICENSE`.
