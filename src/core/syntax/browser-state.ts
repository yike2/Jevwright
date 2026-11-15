import { isMap, isScalar } from "yaml";
import type { FieldReader } from "./fields.js";
import type { Cookie, TestCase } from "./types.js";

export type BrowserState = Pick<TestCase, "headers" | "cookies" | "localStorage" | "sessionStorage">;

// RFC 9110 token characters, which header and cookie names are made of.
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const TOKEN_HINT = "use letters, digits, and - _ . ! # $ % & ' * + ^ ` | ~";
const SAME_SITE = ["Strict", "Lax", "None"] as const;

const hasVariable = (text: string) => text.includes("{{");

// True when a cookie `domain` is `host` or a parent of it; a leading dot is ignored.
function cookieDomainMatches(domain: string, host: string): boolean {
  const parent = domain.replace(/^\./, "").toLowerCase();
  const own = host.toLowerCase();
  return own === parent || own.endsWith(`.${parent}`);
}

/** Why a cookie's `domain` cannot be set for a valid `baseUrl`; undefined when it can. */
export function cookieDomainProblem(name: string, domain: string, baseUrl: string): string | undefined {
  if (cookieDomainMatches(domain, new URL(baseUrl).hostname)) return undefined;
  // The message quotes the baseUrl whole, so redaction can put back a Variable's {{NAME}}.
  return `Cookie "${name}" is for "${domain}", which is not the host of the baseUrl "${baseUrl}" or a parent of it`;
}

// The baseUrl when the file spells it out as a valid URL; a baseUrl with a Variable is known only at execution time.
function knownBaseUrl(baseUrl: string | undefined): string | undefined {
  if (baseUrl === undefined || hasVariable(baseUrl) || !URL.canParse(baseUrl)) return undefined;
  return baseUrl;
}

type ReadValue<T> = (map: FieldReader, name: string) => T | undefined;
type Entries<T> = { map: FieldReader; value: Record<string, T> } | undefined;

// Reads a name → value object: E009 for a name that is empty, not text, or (with `token`) not a token.
// Keeps only the entries whose value is valid; any diagnostic keeps the TestCase from being built anyway.
function entries<T>(fields: FieldReader, key: string, kind: string, token: boolean, read: ReadValue<T>): Entries<T> {
  const map = fields.object(key);
  if (!map) return undefined;
  const found: [string, T][] = [];
  for (const { name, node } of map.keys()) {
    if (name === undefined) {
      map.report("E009", `${kind} names must be text, not a list or an object`, node);
      continue;
    }
    if (name === "") map.report("E009", `${kind} names must not be empty`, node);
    else if (token && !TOKEN.test(name)) map.report("E009", `${kind} name "${name}" is not valid: ${TOKEN_HINT}`, node);
    const value = read(map, name);
    if (value !== undefined) found.push([name, value]);
  }
  // fromEntries defines every name as an own field, so a name such as "__proto__" stays a plain entry.
  return { map, value: Object.fromEntries(found) };
}

const text: ReadValue<string> = (map, name) => map.string(name, false, true);

const header: ReadValue<string> = (map, name) => {
  const value = text(map, name);
  if (value === undefined || !/[\r\n]/.test(value)) return value;
  map.invalid(name, `Header "${name}" must be on one line`);
  return undefined;
};

// A cookie is its value (short form) or an object with "value" and its attributes (full form).
const cookie =
  (baseUrl: string | undefined): ReadValue<Cookie> =>
  (map, name) => {
    const node = map.resolve(map.get(name));
    if (isScalar(node) && node.value !== null) {
      const value = text(map, name);
      return value === undefined ? undefined : { value };
    }
    if (!isMap(node)) {
      map.invalid(name, `Cookie "${name}" must be a string or an object with "value"`);
      return undefined;
    }
    const attrs = map.object(name)!;
    const value = attrs.string("value", true, true);
    const domain = attrs.string("domain");
    const path = attrs.string("path");
    if (path !== undefined && !path.startsWith("/") && !hasVariable(path)) {
      attrs.invalid("path", '"path" must start with "/"');
    }
    const httpOnly = attrs.boolean("httpOnly");
    const secure = attrs.boolean("secure");
    const sameSite = attrs.oneOf("sameSite", SAME_SITE);
    // Browsers drop a SameSite=None cookie that is not Secure.
    if (sameSite === "None" && secure !== true) attrs.report("E008", '"sameSite: None" needs "secure: true"');
    const problem =
      domain !== undefined && baseUrl !== undefined && !hasVariable(domain)
        ? cookieDomainProblem(name, domain, baseUrl)
        : undefined;
    if (problem) attrs.invalid("domain", problem);
    attrs.reportUnknown();
    if (value === undefined) return undefined;
    return {
      value,
      ...(domain !== undefined ? { domain } : {}),
      ...(path !== undefined ? { path } : {}),
      ...(httpOnly !== undefined ? { httpOnly } : {}),
      ...(secure !== undefined ? { secure } : {}),
      ...(sameSite !== undefined ? { sameSite } : {}),
    };
  };

/** Reads `headers`, `cookies`, `localStorage`, and `sessionStorage` from the root, reporting every problem. */
export function parseBrowserState(fields: FieldReader, baseUrl: string | undefined): BrowserState {
  const hasBaseUrl = fields.has("baseUrl");
  // Cookies and storage belong to an origin, which only the baseUrl gives.
  function forOrigin<T>(read: Entries<T>, key: string, subject: string) {
    if (read && !hasBaseUrl) read.map.report("E008", `"${key}" needs a "baseUrl": ${subject} for the baseUrl's origin`);
    return read?.value;
  }
  const headers = entries(fields, "headers", "Header", true, header)?.value;
  const cookies = forOrigin(
    entries(fields, "cookies", "Cookie", true, cookie(knownBaseUrl(baseUrl))),
    "cookies",
    "they are set",
  );
  const localStorage = forOrigin(entries(fields, "localStorage", "Storage", false, text), "localStorage", "it is set");
  const sessionStorage = forOrigin(
    entries(fields, "sessionStorage", "Storage", false, text),
    "sessionStorage",
    "it is set",
  );
  return {
    ...(headers ? { headers } : {}),
    ...(cookies ? { cookies } : {}),
    ...(localStorage ? { localStorage } : {}),
    ...(sessionStorage ? { sessionStorage } : {}),
  };
}
