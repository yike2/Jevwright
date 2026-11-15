# Design System

The design system is the shared look and wording of the Jevwright frontend: the color, type, spacing and status tokens, the light and dark themes, the page layouts, the component rules, and how messages are written. It applies to every page of `src/app/frontend`; the pages themselves are specified in [frontend.md](frontend.md).

## 1. Functional Definition

### 1.1 Principles

| Principle | Rule |
| --------- | ---- |
| Neutral with blue accents | The surfaces and text are true greys; blue is only for the primary fill, links, the selected row and focus (2.1) |
| Tokens only | Components use semantic tokens through Tailwind utilities (`bg-background`, `text-muted-foreground`, `border-input`). Hex values, `[#...]` classes, Tailwind palette colors (`slate-*`, `red-*`) and inline styles for color are not used in components |
| Meaning, not look | A token is chosen for what it means: `success` for a passed Run, never because it is green (Atlassian design tokens) |
| shadcn/ui first | UI is built from the shadcn/ui components in `components/ui/`, added with `shadcn add` and pinned (frontend.md 1.12). A new pattern becomes a component or a variant there, not a one-off set of classes |
| Both themes | Every pairing meets WCAG 2 AA in light and dark (2.2); a unit test checks the token pairs |
| Not by color alone | A status always has an icon whose shape differs per status, and a text label or an accessible name (WCAG 1.4.1) |

### 1.2 Sources

The colors follow VS Code's Light Modern and Dark Modern themes (2.8), and the layout, type and radius follow the visual prototype `docs/references/ui-prototype.html`; both are written as shadcn's semantic variables. The rules draw on these references:

| Topic | Source |
| ----- | ------ |
| Variables, `X` / `X-foreground` pairs, `@theme inline`, adding a color | shadcn/ui Theming, https://ui.shadcn.com/docs/theming |
| Light / Dark / System with `next-themes` | shadcn/ui Dark mode for Next.js, https://ui.shadcn.com/docs/dark-mode/next; next-themes README, https://github.com/pacocoursey/next-themes |
| `@custom-variant dark` | Tailwind CSS dark mode, https://tailwindcss.com/docs/dark-mode |
| Semantic token names | Atlassian design tokens, https://atlassian.design/foundations/tokens/design-tokens; Fluent 2 design tokens, https://fluent2.microsoft.design/design-tokens |
| Neutral steps by role | Radix Colors, https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale; Vercel Geist colors, https://vercel.com/geist/colors |
| Status roles, muted and emphasis, not by color alone | Primer color, https://primer.style/foundations/primitives/color; Primer color considerations, https://primer.style/accessibility/color-considerations |
| Focus | Primer focus management, https://primer.style/accessibility/focus-management; W3C Understanding 2.4.13, https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html |
| Spacing | GitLab Pajamas spacing, https://design.gitlab.com/product-foundations/spacing; Carbon spacing, https://carbondesignsystem.com/elements/spacing/overview/ |
| Editor layout regions | VS Code UX guidelines, https://code.visualstudio.com/api/ux-guidelines/overview |
| Palette | VS Code's Light Modern and Dark Modern themes, https://github.com/microsoft/vscode/tree/main/extensions/theme-defaults/themes |
| Messages | GitLab Pajamas error messages, https://design.gitlab.com/content/error-messages; Microsoft Win32 error messages, https://learn.microsoft.com/en-us/windows/win32/uxguide/mess-error; NN/g error-message guidelines, https://www.nngroup.com/articles/error-message-guidelines/ |

## 2. Tokens

The tokens are CSS variables in `app/globals.css`: `:root` holds the light theme and `.dark` the dark theme, and `@theme inline` maps each one to a Tailwind color (`--color-success: var(--success)` makes `bg-success`, `text-success`, `bg-success/12`). Values are hex, written straight into the semantic tokens; with two themes and no brand theming there is no separate primitive palette.

### 2.1 Color

| Token | Light | Dark | Use |
| ----- | ----- | ---- | --- |
| `--background` | `#f8f8f8` | `#1f1f1f` | The page behind panels and cards |
| `--foreground` | `#1f1f1f` | `#cccccc` | Body text |
| `--card` | `#ffffff` | `#1f1f1f` | Cards and the editor's consoles; in dark, cards are set apart by their ring or border, as VS Code's editor is |
| `--popover` | `#ffffff` | `#252525` | Dialogs and menus |
| `--card-foreground`, `--popover-foreground` | `#1f1f1f` | `#cccccc` | Text on them |
| `--sidebar` | `#f8f8f8` | `#181818` | The workspace sidebar |
| `--sidebar-foreground` | `#1f1f1f` | `#cccccc` | Text in it |
| `--sidebar-accent` | `#dce8f6` | `#04395e` | The selected tree row |
| `--sidebar-border` | `#e0e0e0` | `#2b2b2b` | Sidebar edges and tree guides |
| `--primary` | `#005fb8` | `#0078d4` | The fill of the main action of a page, pressed toggles, the brand mark. Never text: colored text uses `info` |
| `--primary-foreground` | `#ffffff` | `#ffffff` | Text on `primary` |
| `--secondary`, `--muted` | `#f0f0f0` | `#2b2b2b` | Secondary buttons, segmented controls, neutral badges |
| `--muted-foreground` | `#5f5f5f` | `#a3a3a3` | Secondary text: times, durations, hints; also the queued and never-run status |
| `--accent` | `--foreground` at 6% | `--foreground` at 8% | Hover fill of rows and ghost controls (shadcn's `accent` is a highlight, not the brand) |
| `--info` | `#005fb8` | `#4daafc` | Links, colored text, informational badges |
| `--destructive` | `#c42b1c` | `#fb625a` | Failed, errors, Delete |
| `--success` | `#187534` | `#3fb950` | Passed, a valid file |
| `--warning` | `#8a5a00` | `#d29922` | Running, unsaved changes |
| `--destructive-foreground`, `--success-foreground`, `--warning-foreground`, `--info-foreground` | `#ffffff` | `#1f1f1f` | Text on a solid role fill |
| `--border` | `#e0e0e0` | `#2b2b2b` | Separators and panel edges, which need no contrast |
| `--input` | `#858585` | `#7a7a7a` | Borders of inputs and outline controls, which need 3:1 |
| `--ring` | `#0090f1` | `#0078d4` | The focus ring |
| `--code`, `--code-foreground` | `#ffffff`, `#1f1f1f` | `#1f1f1f`, `#cccccc` | The YAML editor and source blocks |
| `--syntax-key` | `#800000` | `#569cd6` | YAML keys in the editor |
| `--syntax-string` | `#0451a5` | `#ce9178` | YAML strings |
| `--syntax-literal` | `#0b7a52` | `#b5cea8` | Numbers, booleans and `null` |
| `--syntax-comment` | `#007a00` | `#76a660` | Comments, in italics |
| `--scrollbar-thumb`, `--scrollbar-thumb-hover` | `#8a8a8a`, `#6b6b6b` | `#737373`, `#8f8f8f` | Scrollbar thumbs (2.9) |
| `--chart-1` … `--chart-5` | info, success, destructive, warning, muted-foreground | the same roles | Charts, once a page has one |

Most values are VS Code's own; the syntax colors are its Light+ and Dark+ YAML colors. Six differ so that every pair passes 2.2:
- Light `--success` is `#187534`, not `#1a7f37`, which is 4.5:1 on `muted` but only 4.3:1 on its badge tint.
- Dark `--destructive` is `#fb625a`, not `#f85149`, which is 4.2:1 on `muted`.
- Dark `--muted-foreground` is `#a3a3a3`, not `#9d9d9d`, which is 4.4:1 on the selected row.
- Dark `--input` is `#7a7a7a`, so input borders keep 3:1 on dialogs.
- Light `--syntax-literal` is `#0b7a52` and light `--syntax-comment` `#007a00`, not `#098658` and `#008000`, and dark `--syntax-comment` is `#76a660`, not `#6a9955`, so each keeps 4.5:1 on the editor's active line.

Dark `--primary` `#0078d4` carries white button text at 4.53:1, just above 4.5:1. It stays as it is; the next shade that keeps the hue with margin is `#006cc1`, at 5.4:1.

### 2.2 Contrast

All ratios are WCAG 2 contrast ratios. Body text needs 4.5:1; input borders, the focus ring and other meaningful non-text parts need 3:1 against what is next to them (SC 1.4.11). Disabled controls are exempt. `design-tokens.test.ts` checks these pairs in both themes, and that the neutrals are true greys. The lowest ratio of each group:

| Pair | Light | Dark |
| ---- | ----- | ---- |
| `foreground` on `background`, `card` | 15.5, 16.5 | 10.3, 10.3 |
| `muted-foreground` on `background`, `card`, `popover`, `sidebar`, `muted` | ≥ 5.6 | ≥ 5.6 |
| `info` on any surface | ≥ 5.5 | ≥ 5.7 |
| `destructive`, `success`, `warning` text on any surface | ≥ 4.9 | ≥ 4.7 |
| A role's text on its 12% badge tint over a card | ≥ 4.6 | ≥ 4.6 |
| `primary-foreground` on `primary` | 6.3 | 4.5 |
| Other `X-foreground` on a solid `X` | ≥ 5.6 | ≥ 4.7 |
| `foreground`, `muted-foreground` on the selected tree row | 13.3, 5.1 | 7.5, 4.7 |
| `code-foreground` on `code` | 16.5 | 10.3 |
| `syntax-*` on `code` and on the active line (`foreground` at 8% over `code`) | ≥ 4.6 | ≥ 4.7 |
| `input` border on `background`, `card`, `popover`, `sidebar` | ≥ 3.4 | ≥ 3.5 |
| `ring` on `background`, `card`, `popover`, `sidebar` | ≥ 3.1 | ≥ 3.3 |
| `scrollbar-thumb` on `background`, `card`, `popover`, `sidebar`, `code` | ≥ 3.2 | ≥ 3.2 |

Tints (`bg-success/12` and the hover fill) are computed in sRGB in the test; the browser mixes `color-mix(in oklch, ...)` slightly differently, so every tinted pair keeps a margin above its threshold.

### 2.3 Status

Every Run, Step and Test File status maps to one role and one icon, in `components/workspace/status-badge.tsx` only. `StatusIcon` draws the icon in the role's color; `StatusBadge` adds the label on the role's 12% tint.

| Status | Role | Icon (lucide) | Label |
| ------ | ---- | ------------- | ----- |
| `passed` | `success` | `CircleCheck` | Passed |
| `failed` | `destructive` | `CircleX` | Failed |
| `running`, `active` (a file's latest Run is queued or running) | `warning` | `LoaderCircle`, spinning unless reduced motion is set | Running |
| `queued` | `muted-foreground` | `Clock` | Queued |
| `pending`, `none` (never run) | `muted-foreground` | `CircleDashed` | Pending, Never run |
| `saved` (an open file's draft is saved) | `muted-foreground` | `Check` | Saved |
| `unsaved` (an open file's draft differs) | `warning` | `CircleDot` | Unsaved |

The labels come from `runStatusLabel`, `stepStatusLabel`, `statusTitle` and `fileStateLabel` (frontend.md 1.7, 1.9, 1.10). Where the label cannot be shown, as in the sidebar tree, the icon has a `title` with the label.

### 2.4 Typography

| Token | Value | Use |
| ----- | ----- | --- |
| `--font-sans`, `--font-heading` | IBM Plex Sans (400, 500, 600, 700) | All text |
| `--font-mono` | IBM Plex Mono (400, 500) | YAML, file names, Variable names, selectors, locate methods, diagnostics |

The fonts are loaded with `next/font/google` in `app/layout.tsx`, which serves them from the app's own origin. The app uses a productive type scale: 14px body with a 1.45 line height, 12px for secondary details, 13px mono, 16–20px for headings. The landing page uses an expressive scale on top of it: a 36–48px hero heading, 30px section headings and 16–18px lead text. Text uses sentence case; labels and headings have no end punctuation.

### 2.5 Spacing and density

Spacing uses Tailwind's 4px scale and `gap` on containers rather than margins on children (Pajamas):

| Gap | Use |
| --- | --- |
| 2–4px (`gap-0.5`, `gap-1`) | Inside a component, e.g. a row's icon buttons |
| 8px (`gap-2`) | Related items, e.g. a toolbar |
| 16px (`gap-4`, `space-y-4`) | Unrelated items on a page |
| 24px (`gap-6`) | Sub-sections |
| 32px and more | Sections; 64–96px between landing sections |

The workspace is compact, like an editor's workbench: tree rows are 28–32px high with 24px icon buttons, controls 28–32px, console headers 32px and the status bar 28px; consoles pad their content by 8px and the code starts 8px after the gutter. Workspace regions have no margin between them, only 1px borders and resize handles. The landing and auth pages use the default sizes (36px buttons).

### 2.6 Radius

`--radius` is `0.375rem` (6px), the prototype's control radius; shadcn derives `--radius-sm` … `--radius-4xl` from it. Cards and dialogs use `rounded-xl`, controls `rounded-lg`, tree rows `rounded-md`.

### 2.7 Focus

Every interactive element shows a focus indicator on keyboard focus only (`:focus-visible`): a 2px solid `--ring` outline with a 2px offset from the base layer, or, in shadcn components that draw their own, a 2px `ring-ring` at full strength. The ring is a bright blue (VS Code's focus border), never a grey, so it passes 3:1 on every surface. An outline is never removed without that replacement.

### 2.8 Why this palette

The workspace is an editor: a tree, a code area, and panels of results. Its colors therefore follow the editor most of its users already know, VS Code's Light Modern and Dark Modern. Grey surfaces keep YAML, diagnostics and screenshots in front. Blue marks only what can be acted on or is selected, and the status colors stay the only other hues on a page. The landing and auth pages use the same tokens, so the product looks the same from the first page to the editor.

| Alternative | Why not |
| ----------- | ------- |
| Indigo, the prototype's `#2f43c4` / `#8d9bff` with blue-tinted greys | Reads as purple, and its tinted neutrals give every surface a color cast that competes with the status colors |
| Graphite or zinc neutrals with a near-black primary | Quiet, but the main action and links lose their color cue, and selection and focus need a separate accent anyway |
| Teal accent | Distinct, but close to `success` green, so a primary button and a passed status are easy to confuse |

### 2.9 Scrollbars

Scrollbars are thin everywhere, the code editor included. The base layer sets `scrollbar-width: thin` and `scrollbar-color: var(--scrollbar-thumb) transparent` on every element, switching to `--scrollbar-thumb-hover` while the pointer is over it. Safari reads `::-webkit-scrollbar` instead: 8px wide, a transparent track, and a fully rounded thumb that takes the hover color under the pointer. The track is transparent, so the thumb is measured against every surface it can cross; it keeps 3:1 on all of them (2.2), and the hover color is darker in light and brighter in dark.

## 3. Themes

The app has a Light, a Dark and a System theme. System, the default, follows the operating system's `prefers-color-scheme` and changes with it while the page is open.

| Rule | |
| ---- | - |
| Provider | `components/theme/theme-provider.tsx` wraps `next-themes`' `ThemeProvider` with `attribute="class"`, `defaultTheme="system"`, `enableSystem` and `disableTransitionOnChange`; `app/layout.tsx` renders it around every page, and `<html>` has `suppressHydrationWarning` |
| Class | The resolved theme is the `dark` or `light` class on `<html>`; `@custom-variant dark (&:is(.dark *))` and the `.dark` token block read it |
| No flash | `next-themes` adds an inline script to the server's HTML that sets the class from storage before the page paints and before React loads |
| Persistence | The choice is stored per browser in `localStorage` under `theme` (`light`, `dark` or `system`) |
| Native controls | `next-themes` sets `color-scheme` to the resolved theme, so scrollbars and form controls match |
| Switch | `components/theme/theme-toggle.tsx`: a shadcn `ToggleGroup` named "Theme" with three buttons, "Light", "Dark" and "System" (icons with accessible names and titles); the pressed one is the stored choice. It marks a choice only after mount, since the server cannot know it. It is in the site header (landing, `/login`, `/register`) and in the workspace sidebar's account area |
| Theme-aware code | Code that needs the actual colors reads `resolvedTheme`, never `theme`, and reads colors from the CSS variables rather than copying hex values |

## 4. Layout

### 4.1 Pages

| Layout | Pages | Skeleton |
| ------ | ----- | -------- |
| Site | `/` | A sticky header (logo to `/`, docs links, theme switch, and one button: Sign in, or Open workspace), full-width sections with a centered 72rem column that alternate `background` and `card`, a footer (frontend.md 1.14) |
| Auth | `/login`, `/register` | The site header without the auth links, and one centered card |
| Workspace | `/files`, `/files/:id`, `/projects/:id/variables`, `/runs/:id` | The full window, like VS Code: a resizable sidebar on the left (320px by default, 220–600px; brand, Projects tree, account and theme switch) and the page on the right, edge to edge. No centered column and no outer margin: a page starts 16px from the sidebar, and the editor page has no padding at all (4.3). The window never scrolls; each region scrolls on its own. Below 768px the sidebar is behind a menu button |

### 4.2 Where things go

These rules follow the VS Code UX guidelines for the regions of an editor-like app:

| Region | Holds | Does not hold |
| ------ | ----- | ------------- |
| Sidebar | The Projects tree and the account | Whole pages, or a single command that could be a button |
| Page header | The file or Run name, its status, and the page's actions; the primary action (Run) is the only `default` button | More than one primary action |
| Editor area | The open file, or a page such as Variables | A dialog for something the user keeps open while working |
| Panel (console) | Output of the open file: Problems, the Run and its history | Actions on other files |
| Status bar | The open file's state, its problems count, the cursor, the consoles toggle | Messages that need an answer |
| Sheet | Details the user looks at over the editor and closes again: a Run's details | Forms |
| Inline, next to its source | Field problems, diagnostics on their line, a name problem under the tree input, a save or run error | Toasts for things the user is looking at |
| Dialog | A choice the user started and must answer now: delete | Messages that need no answer; create and rename, which happen in place in the tree |

### 4.3 Editor page

| Region | Default | Rule |
| ------ | ------- | ---- |
| Header | One compact row | File name, file state badge, Save, Run (the one `default` button), the consoles toggle |
| Editor \| consoles | 60% / 40% | A horizontal split; the console column collapses to nothing, and each console to its 32px header |
| Problems / Run | 50% / 50% | A vertical split in the console column |
| Status bar | 28px | Along the bottom, `background` with a top border, `text-xs` |
| Narrow screens | Below 768px | The consoles stack under the editor in a vertical split |

Split sizes are kept per browser. The handles are 1px `border` lines with a wider hit area, `separator`s that move with the arrow keys and show the focus ring.

## 5. Components

| Component | Rule |
| --------- | ---- |
| `Button` | `default` for the one main action of a view, `secondary` or `outline` for the others, `ghost` for toolbar and tree icons, `destructive` for Delete. An icon-only button has an `aria-label` and a `title`. Links that look like buttons use `buttonVariants()` on a `Link` |
| Links | `text-info`, underlined on hover or always in running text; `buttonVariants({ variant: "link" })` uses the same color |
| `Card` | Panels: overview groups, the Variables list and form, landing features; the consoles use `card` as their surface without a ring |
| `Badge` | Short labels; the `success`, `warning`, `destructive`, `info` and `muted` variants are the status roles (2.3) |
| `ToggleGroup` | A choice among a few options shown at once, such as the theme |
| `Tabs` | Alternative views of one thing, such as the replayed Runs and the Web / CLI quick start on the landing page |
| `Dialog` | The delete confirmation (frontend.md 1.11) and the screenshot viewer (1.9) |
| `Sheet` | From the right, over most of the page, for a Run's details (frontend.md 1.9); closes with Escape, its close button, or a click on the uncovered part |
| `Resizable` | Every split of the workspace: the sidebar width, editor \| consoles, Problems / Run; 1px handles |
| `Tooltip` | A tree name cut off with an ellipsis, on hover and on keyboard focus; never the only place of a name |
| Code editor | CodeMirror 6 with a theme from the tokens: `--code` surface, `--syntax-*` highlighting, `--accent` active line, `--destructive` wavy underline and gutter marker for a diagnostic, `--popover` for its hover message (frontend.md 1.7) |
| `Input`, `Label` | Every field has a visible `Label`; a problem shows under the field (6) |
| Icons | lucide-react, `aria-hidden` when a label is next to them |

Motion: spinners and the tree's chevron stop under `prefers-reduced-motion` (`motion-reduce:`), and theme changes do not animate.

## 6. Messages

These rules apply to every message the frontend shows and every `message` the backend returns (frontend.md 1.3, backend.md 1.7).

1. Say what is wrong, then how to fix it, in one or two plain sentences: "Password must be at least 8 characters."
2. Be specific: name the field, file, step or line. Each failure case has its own message; a generic "Something went wrong" is only for an unknown cause.
3. Use one pattern per kind of problem: "`<Field>` is required.", "`<Field>` must be `<rule>`.", "`<Field>` can be at most `<limit>`." Sentences end with a period; labels, titles and buttons have none.
4. No blame, no jokes, no "Oops"; avoid "invalid", "illegal" and "fatal" in favor of the rule itself. No "please" or "sorry" in routine messages.
5. Keep codes and internals secondary. A diagnostic code such as `E005` may follow the sentence; a stack trace, an HTTP status or zod's wording never replaces it.
6. A button names its action in one or two words: "Run", "Add the Quick Start project", "Log in". Not "OK" or "Click here".
7. Show the message next to its source, as visible text: under the field with `role="alert"`, `aria-invalid` and `aria-describedby`; diagnostics on their line in the editor and in the Problems console with their line.
8. Keep the user's input on an error; only a password may be cleared.
9. `failed` is a status. In prose use "couldn't" or "cannot": "Cannot reach the server. Check your connection and try again."

| Instead of | Write |
| ---------- | ----- |
| `Too small: expected string to have >=8 characters` | Password must be at least 8 characters. |
| `Invalid name` | Use only letters, digits, -, _ and ., with no spaces. |
| `Request failed (500)` | Something went wrong on the server. Try again in a moment. |
| `Unique constraint failed` | A module with this name already exists in this project. |

## 7. Accessibility

The design system meets WCAG 2.1 AA (AGENTS.md 7.2): contrast as in 2.2; status not by color alone (2.3); visible focus on every control (2.7); a `<label>` for every field and problems through `aria-describedby`; live step updates in `aria-live="polite"`; reduced motion respected (5); semantic HTML before ARIA, such as `header`, `nav`, `main`, `section` with a name, `figure` with `figcaption`.

## 8. Module Layout

| File | Responsibility |
| ---- | -------------- |
| `app/globals.css` | The tokens of both themes, the Tailwind mapping, the base layer (fonts, body text, focus) |
| `app/layout.tsx` | Fonts and the theme provider around every page |
| `components/theme/theme-provider.tsx` | `next-themes` with the settings of 3 |
| `components/theme/theme-toggle.tsx` | The Light / Dark / System switch |
| `components/workspace/status-badge.tsx` | The status map of 2.3: `StatusIcon`, `StatusBadge` |
| `components/landing/brand-mark.tsx` | The product mark, drawn in `primary` |
| `components/workspace/code-editor.tsx` | The editor theme and highlighting from the tokens (5) |
| `components/ui/` | shadcn/ui components; their focus rings use `ring-ring` at full strength, and `Badge` has the status variants |

## 9. Test Plan

| Type | Coverage | Location |
| ---- | -------- | -------- |
| Unit | Every token pair of 2.2 in both themes, the syntax colors, the scrollbar thumbs, and that the neutrals are true greys | `src/tests/unit/app/frontend/design-tokens.test.ts` |
| E2E | The editor fills the window between the sidebar and the consoles, edge to edge, and the page does not scroll | `src/tests/e2e/editor.e2e.ts` (TC-ED-12) |
| E2E | The theme follows the system by default; a chosen theme persists after a reload; System follows the setting again; the stored theme is set before the page's scripts run; the switch is on the login page and in the workspace | `src/tests/e2e/theme.e2e.ts` |
