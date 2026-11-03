/** True when `url` matches `pattern`: a glob when it contains `*`, otherwise an exact URL. */
export function matchesUrl(url: string, pattern: string, baseUrl?: string): boolean {
  if (!pattern.includes("*")) return url === new URL(pattern, baseUrl).href;
  // Like Playwright's waitForURL, a glob such as "/board/*" is resolved against baseUrl, and an absolute one
  // is normalized the way the browser writes URLs (lowercase host, encoded spaces); one starting with "*" is
  // matched as written.
  const resolved = pattern.startsWith("*") ? pattern : new URL(pattern, baseUrl).href;
  return globToRegExp(resolved).test(url);
}

function globToRegExp(glob: string): RegExp {
  const source = glob
    .split("**")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*"))
    .join(".*");
  return new RegExp(`^${source}$`);
}
