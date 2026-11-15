import type { BrowserContext, BrowserContextOptions } from "playwright";
import { firstLine } from "./errors.js";
import type { LaunchOptions } from "./types.js";

/** The context's `storageState`, which writes `localStorage` once for the baseUrl's origin (1.13). */
export function storageState(options: LaunchOptions): BrowserContextOptions["storageState"] {
  if (options.localStorage === undefined || options.baseUrl === undefined) return undefined;
  const localStorage = Object.entries(options.localStorage).map(([name, value]) => ({ name, value }));
  return { cookies: [], origins: [{ origin: new URL(options.baseUrl).origin, localStorage }] };
}

/** Sets the headers, cookies, and sessionStorage of `options` on a new context (1.13). */
export async function applyState(context: BrowserContext, options: LaunchOptions): Promise<void> {
  const { baseUrl, headers, cookies, sessionStorage } = options;
  if (baseUrl === undefined) {
    // Without a baseUrl there is no origin to keep the headers to; the Syntax Analyzer allows no cookies or storage.
    if (headers !== undefined) await context.setExtraHTTPHeaders(headers);
    return;
  }
  const url = new URL(baseUrl);
  if (headers !== undefined) await sendHeaders(context, url.origin, headers);
  if (cookies !== undefined) {
    await context
      .addCookies(
        Object.entries(cookies).map(([name, cookie]) => ({
          name,
          value: cookie.value,
          // Playwright gives a cookie to subdomains only when its domain starts with "."; the default is host-only.
          domain: cookie.domain === undefined ? url.hostname : `.${cookie.domain.replace(/^\./, "")}`,
          path: cookie.path ?? "/",
          httpOnly: cookie.httpOnly ?? false,
          secure: cookie.secure ?? url.protocol === "https:",
          sameSite: cookie.sameSite ?? "Lax",
        })),
      )
      .catch((error: unknown) => {
        // Playwright's message starts with its method and protocol call, e.g. "...(Storage.setCookies): Invalid cookie fields".
        throw new Error(`The browser refused the cookies: ${firstLine(error).replace(/^.*: /, "")}`, { cause: error });
      });
  }
  if (sessionStorage !== undefined) {
    // An init script runs in every new document of every tab before the page's scripts; JSON keeps the values literal.
    const entries = JSON.stringify(Object.entries(sessionStorage));
    await context.addInitScript({
      content: `if (location.origin === ${JSON.stringify(url.origin)}) {
  for (const [name, value] of ${entries}) sessionStorage.setItem(name, value);
}`,
    });
  }
}

// Adds `headers` to every request to `origin` only, so a token never reaches another host. It falls back to the
// routes registered before it, such as the private network block, which see the added headers.
async function sendHeaders(context: BrowserContext, origin: string, headers: Record<string, string>) {
  // Playwright gives request headers in lower case, so ours replace any the browser sends under the same name.
  const added = Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value] as const);
  await context.route(
    (url) => url.origin === origin,
    (route) => route.fallback({ headers: { ...route.request().headers(), ...Object.fromEntries(added) } }),
  );
}
