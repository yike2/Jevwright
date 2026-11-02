/** True when `url` matches `pattern`: a glob when it contains `*`, otherwise an exact URL. */
export function matchesUrl(url: string, pattern: string, baseUrl?: string): boolean {
  if (!pattern.includes("*")) return url === new URL(pattern, baseUrl).href;
  // Like Playwright's waitForURL, a glob such as "/board/*" is resolved against baseUrl
  // (an absolute one resolves to itself); one starting with "*" is matched as written.
  const resolved = baseUrl && !pattern.startsWith("*") ? new URL(pattern, baseUrl).href : pattern;
  return globToRegExp(resolved).test(url);
}

function globToRegExp(glob: string): RegExp {
  const source = glob
    .split("**")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*"))
    .join(".*");
  return new RegExp(`^${source}$`);
}
