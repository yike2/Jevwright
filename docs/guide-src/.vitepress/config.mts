import { defineConfig } from "vitepress";

// The user guide (README "User guide"): built by `pnpm docs:build` into docs/guide/, which GitHub Pages serves from
// main's /docs folder. The build must be deterministic, so CI can check that docs/guide/ matches these sources:
// no lastUpdated, which reads git dates, and one page at a time (buildConcurrency).
export default defineConfig({
  title: "Jevwright",
  description: "Web tests as plain YAML steps. Playwright runs them, and Jev helps only where a selector is not enough.",
  lang: "en-US",
  base: "/Jevwright/guide/",
  outDir: "../guide",
  cleanUrls: false,
  lastUpdated: false,
  // One page at a time, so the search index lists pages in the same order on every build.
  buildConcurrency: 1,
  markdown: {
    // Test files write Variables as {{NAME}}, which Vue would read as an expression in inline code; code blocks are
    // already left alone.
    config(md) {
      const render = md.renderer.rules.code_inline!;
      md.renderer.rules.code_inline = (tokens, index, options, env, self) => {
        tokens[index]!.attrSet("v-pre", "");
        return render(tokens, index, options, env, self);
      };
    },
  },
  head: [["link", { rel: "icon", href: "/Jevwright/guide/favicon.svg", type: "image/svg+xml" }]],
  themeConfig: {
    logo: "/favicon.svg",
    nav: [
      { text: "Guide", link: "/guide/introduction", activeMatch: "/guide/" },
      { text: "Syntax", link: "/reference/test-file", activeMatch: "/reference/" },
      { text: "Open the workspace", link: "https://app.94.72.126.118.sslip.io" },
    ],
    sidebar: [
      {
        text: "Getting started",
        items: [
          { text: "Introduction", link: "/guide/introduction" },
          { text: "Quick start", link: "/guide/quick-start" },
          { text: "General workflow", link: "/guide/workflow" },
        ],
      },
      {
        text: "Using Jevwright",
        items: [
          { text: "The web workspace", link: "/guide/workspace" },
          { text: "Agent Skill", link: "/guide/agent-skill" },
        ],
      },
      {
        text: "YAML syntax",
        items: [
          { text: "Test file", link: "/reference/test-file" },
          { text: "Actions", link: "/reference/actions" },
          { text: "Locating elements", link: "/reference/locating" },
          { text: "Waiting and assertions", link: "/reference/assertions" },
          { text: "Diagnostics", link: "/reference/diagnostics" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/yike2/Jevwright" }],
    editLink: {
      pattern: "https://github.com/yike2/Jevwright/edit/main/docs/guide-src/:path",
      text: "Edit this page on GitHub",
    },
    search: { provider: "local" },
    outline: { level: [2, 3] },
    footer: { message: "Jevwright user guide" },
  },
});
