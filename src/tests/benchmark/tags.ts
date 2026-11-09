// The Tag vocabulary of benchmark.md 1.5.
export const ELEMENT_TAGS: readonly string[] = [
  "button",
  "link",
  "field",
  "icon",
  "image",
  "dropdown",
  "menu-item",
  "item",
];
export const DESCRIPTION_TAGS: readonly string[] = ["by-text", "by-look", "by-relation", "vague"];
export const LOCATING_TAGS = [
  "repeated",
  "small",
  "offscreen",
  "overlay",
  "shadow",
  "animating",
  "dynamic",
  "changed-layout",
] as const;
export const FACT_TAGS: readonly string[] = ["count", "price", "state", "text", "visual", "negation"];

/** Reads the Tags of a suite file's leading `# tags:` comment; none when it has no such comment. */
export function readTags(source: string): string[] {
  const match = /^# tags: (.+)$/m.exec(source.split("\n", 1)[0] ?? "");
  return match ? match[1].split(",").map((tag) => tag.trim()) : [];
}
