import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// WCAG 2 contrast of the design tokens in globals.css (design-system.md 2.2), for both themes.
const css = readFileSync(new URL("../../../../app/frontend/app/globals.css", import.meta.url), "utf8");

function tokens(selector: ":root" | ".dark"): Record<string, string> {
  const body = new RegExp(`^${selector.replace(".", "\\.")} \\{\\n([\\s\\S]*?)^\\}`, "m").exec(css)?.[1] ?? "";
  return Object.fromEntries([...body.matchAll(/--([\w-]+): (#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]));
}

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;
const luminance = (color: Rgb) => {
  const [r, g, b] = color.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
// A tint such as bg-success/12 or color-mix(..., 14%) over a surface, mixed in sRGB: close to the browser's mix.
const tint = (color: Rgb, surface: Rgb, amount: number) =>
  color.map((c, i) => c * amount + surface[i]! * (1 - amount)) as Rgb;

const TEXT = 4.5;
const NON_TEXT = 3;
const SURFACES = ["background", "card", "sidebar", "muted"];
const ROLES = ["destructive", "success", "warning", "info"];

describe.each([":root", ".dark"] as const)("the %s tokens", (selector) => {
  const t = Object.fromEntries(Object.entries(tokens(selector)).map(([name, hex]) => [name, rgb(hex)])) as Record<
    string,
    Rgb
  >;
  const pair = (fg: string, bg: string) => {
    expect(t[fg], fg).toBeDefined();
    expect(t[bg], bg).toBeDefined();
    return ratio(t[fg]!, t[bg]!);
  };

  it.each(
    SURFACES.flatMap((surface) => ["foreground", "muted-foreground", "primary", ...ROLES].map((fg) => [fg, surface])),
  )("keeps %s text readable on %s", (fg, surface) => {
    expect(pair(fg, surface)).toBeGreaterThanOrEqual(TEXT);
  });

  it.each(["primary", ...ROLES].map((role) => [role]))("keeps %s-foreground readable on a solid %s fill", (role) => {
    expect(pair(`${role}-foreground`, role)).toBeGreaterThanOrEqual(TEXT);
  });

  it.each(ROLES.map((role) => [role]))("keeps %s text readable on its 12% badge tint over a card", (role) => {
    expect(ratio(t[role]!, tint(t[role]!, t.card!, 0.12))).toBeGreaterThanOrEqual(TEXT);
  });

  it("keeps tree rows readable when hovered or selected", () => {
    const selected = tint(t["sidebar-primary"]!, t.sidebar!, 0.14);
    const hovered = tint(t.foreground!, t.sidebar!, 0.07);
    expect(ratio(t["sidebar-foreground"]!, selected)).toBeGreaterThanOrEqual(TEXT);
    expect(ratio(t["muted-foreground"]!, selected)).toBeGreaterThanOrEqual(TEXT);
    expect(ratio(t["sidebar-foreground"]!, hovered)).toBeGreaterThanOrEqual(TEXT);
  });

  it("keeps the editor's code readable", () => {
    expect(pair("code-foreground", "code")).toBeGreaterThanOrEqual(TEXT);
  });

  it.each(["background", "card", "sidebar"].map((surface) => [surface]))(
    "keeps input borders and the focus ring visible on %s",
    (surface) => {
      expect(pair("input", surface)).toBeGreaterThanOrEqual(NON_TEXT);
      expect(pair("ring", surface)).toBeGreaterThanOrEqual(NON_TEXT);
    },
  );
});
