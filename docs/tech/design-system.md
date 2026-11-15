# Design System

The design system is the shared look and wording of the Jevwright frontend: the color, type, spacing and status tokens, the light and dark themes, the page layouts, the component rules, and how messages are written. It applies to every page of `src/app/frontend`; the pages themselves are specified in [frontend.md](frontend.md).

## 1. Functional Definition

### 1.1 Principles

| Principle | Rule |
| --------- | ---- |
| Tokens only | Components use semantic tokens through Tailwind utilities (`bg-background`, `text-muted-foreground`, `border-input`). Hex values, `[#...]` classes, Tailwind palette colors (`slate-*`, `red-*`) and inline styles for color are not used in components |
| Meaning, not look | A token is chosen for what it means: `success` for a passed Run, never because it is green (Atlassian design tokens) |
| shadcn/ui first | UI is built from the shadcn/ui components in `components/ui/`, added with `shadcn add` and pinned (frontend.md 1.12). A new pattern becomes a component or a variant there, not a one-off set of classes |
| Both themes | Every pairing meets WCAG 2 AA in light and dark (2.2); a unit test checks the token pairs |
| Not by color alone | A status always has an icon whose shape differs per status, and a text label or an accessible name (WCAG 1.4.1) |

### 1.2 Sources

The tokens start from the visual prototype `docs/references/ui-prototype.html`, renamed to shadcn's semantic variables. The rules draw on these references:

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
| Messages | GitLab Pajamas error messages, https://design.gitlab.com/content/error-messages; Microsoft Win32 error messages, https://learn.microsoft.com/en-us/windows/win32/uxguide/mess-error; NN/g error-message guidelines, https://www.nngroup.com/articles/error-message-guidelines/ |

## 2. Tokens

The tokens are CSS variables in `app/globals.css`: `:root` holds the light theme and `.dark` the dark theme, and `@theme inline` maps each one to a Tailwind color (`--color-success: var(--success)` makes `bg-success`, `text-success`, `bg-success/12`). Values are hex, written straight into the semantic tokens; with two themes and no brand theming there is no separate primitive palette.

### 2.1 Color

| Token | Light | Dark | Use |
| ----- | ----- | ---- | --- |
| `--background` | `#e8ecf0` | `#0e141a` | The page behind panels and cards |
| `--foreground` | `#16202a` | `#e3e9ef` | Body text |
| `--card`, `--popover` | `#ffffff` | `#18212a` | Cards, dialogs, menus, the Runs and Validation panels |
| `--card-foreground`, `--popover-foreground` | `#16202a` | `#e3e9ef` | Text on them |
| `--sidebar` | `#dde3e9` | `#121a21` | The workspace sidebar |
| `--sidebar-foreground` | `#16202a` | `#e3e9ef` | Text in it |
| `--sidebar-accent` | `#2f43c4` at 14% | `#8d9bff` at 14% | The selected tree row |
| `--sidebar-border` | `#cdd5dd` | `#2a3641` | Sidebar edges and tree guides |
| `--primary` | `#2f43c4` | `#8d9bff` | The main action of a page, links, the brand mark |
| `--primary-foreground` | `#ffffff` | `#0e141a` | Text on `primary` |
| `--secondary`, `--muted` | `#f4f6f8` | `#1d2731` | Secondary buttons, segmented controls, neutral badges |
| `--muted-foreground` | `#4b5763` | `#94a2af` | Secondary text: times, durations, hints |
| `--accent` | `--foreground` at 7% | `--foreground` at 7% | Hover fill of rows and ghost controls (shadcn's `accent` is a highlight, not the brand) |
| `--destructive` | `#b5372f` | `#f0716a` | Failed, errors, Delete |
| `--success` | `#1b7045` | `#4cc08a` | Passed, a valid file |
| `--warning` | `#875900` | `#e5b247` | Running, unsaved changes |
| `--info` | `#2f43c4` | `#8d9bff` | Neutral notices; the same hue as `primary` |
| `--destructive-foreground`, `--success-foreground`, `--warning-foreground`, `--info-foreground` | `#ffffff` | `#0e141a` | Text on a solid role fill |
| `--border` | `#cdd5dd` | `#2a3641` | Separators and panel edges, which need no contrast |
| `--input` | `#717e8b` | `#5e6c79` | Borders of inputs and outline controls, which need 3:1 |
| `--ring` | `#2f43c4` | `#8d9bff` | The focus ring |
| `--code`, `--code-foreground` | `#fbfcfd`, `#16202a` | `#141c24`, `#e3e9ef` | The YAML editor and source blocks |
| `--chart-1` … `--chart-5` | primary, success, destructive, warning, muted-foreground | the same roles | Charts, once a page has one |

The prototype's `--faint` has no token: it measures 2.5:1 (light) and 3.0:1 (dark), too low for meaningful text. The light `--muted-foreground`, `--success`, `--warning` and `--input` are darker than the prototype's `--muted`, `--pass`, `--run` and `--line`, which fail AA on the sidebar or the page background; hues are kept.

### 2.2 Contrast

All ratios are WCAG 2 contrast ratios. Body text needs 4.5:1; input borders, the focus ring and other meaningful non-text parts need 3:1 against what is next to them (SC 1.4.11). Disabled controls are exempt. `design-tokens.test.ts` checks these pairs in both themes; the lowest ratio of each group:

| Pair | Light | Dark |
| ---- | ----- | ---- |
| `foreground` on `background`, `card` | 13.9, 16.5 | 15.1, 13.3 |
| `muted-foreground` on `background`, `card`, `sidebar`, `muted` | ≥ 5.7 | ≥ 5.8 |
| `primary` on any surface | ≥ 5.9 | ≥ 5.9 |
| `destructive`, `success`, `warning` text on any surface | ≥ 4.5 | ≥ 5.2 |
| A role's text on its 12% badge tint over a card | ≥ 4.9 | ≥ 4.7 |
| `X-foreground` on a solid `X` | ≥ 5.9 | ≥ 6.4 |
| `muted-foreground` on the selected tree row | 4.6 | 5.3 |
| `code-foreground` on `code` | 16.1 | 14.1 |
| `input` border on `background`, `card`, `sidebar` | ≥ 3.2 | ≥ 3.0 |
| `ring` on `background`, `card`, `sidebar` | ≥ 5.9 | ≥ 6.4 |

Tints (`bg-success/12`, the 14% selected row, the 7% hover) are computed in sRGB in the test; the browser mixes `color-mix(in oklch, ...)` slightly differently, so every tinted pair keeps a margin above its threshold.

### 2.3 Status

Every Run, Step and Test File status maps to one role and one icon, in `components/workspace/status-badge.tsx` only. `StatusIcon` draws the icon in the role's color; `StatusBadge` adds the label on the role's 12% tint.

| Status | Role | Icon (lucide) | Label |
| ------ | ---- | ------------- | ----- |
| `passed` | `success` | `CircleCheck` | Passed |
| `failed` | `destructive` | `CircleX` | Failed |
| `running`, `active` (a file's latest Run is queued or running) | `warning` | `LoaderCircle`, spinning unless reduced motion is set | Running |
| `queued` | `muted-foreground` | `Clock` | Queued |
| `pending`, `none` (never run) | `muted-foreground` | `CircleDashed` | Pending, Never run |

The labels come from `runStatusLabel`, `stepStatusLabel` and `statusTitle` (frontend.md 1.9, 1.10). Where the label cannot be shown, as in the sidebar tree, the icon has a `title` with the label.

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

The workspace is compact: tree rows are 28–32px high with 24px icon buttons, controls 32px. The landing and auth pages use the default sizes (36px buttons).

### 2.6 Radius

`--radius` is `0.375rem` (6px), the prototype's control radius; shadcn derives `--radius-sm` … `--radius-4xl` from it. Cards and dialogs use `rounded-xl`, controls `rounded-lg`, tree rows `rounded-md`.

### 2.7 Focus

Every interactive element shows a focus indicator on keyboard focus only (`:focus-visible`): a 2px solid `--ring` outline with a 2px offset from the base layer, or, in shadcn components that draw their own, a 2px `ring-ring` at full strength. The ring is the primary color, never a grey, so it passes 3:1 on every surface. An outline is never removed without that replacement.

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
| Site | `/` | A sticky header (brand, theme switch, Log in and Register, or Open workspace), full-width sections with a centered 72rem column, a footer |
| Auth | `/login`, `/register` | The site header without the auth links, and one centered card |
| Workspace | `/files`, `/files/:id`, `/runs/:id` | A 320px sidebar on the left (brand, Projects tree, account and theme switch) and the page on the right in a centered column of at most 64rem. Below 768px the sidebar is behind a menu button |

### 4.2 Where things go

These rules follow the VS Code UX guidelines for the regions of an editor-like app:

| Region | Holds | Does not hold |
| ------ | ----- | ------------- |
| Sidebar | The Projects tree and the account | Whole pages, or a single command that could be a button |
| Page header | The file or Run name, its status, and the page's actions; the primary action (Run) is the only `default` button | More than one primary action |
| Inline, next to its source | Field problems, diagnostics, a save or run error | Toasts for things the user is looking at |
| Dialog | A choice the user started and must answer now: create, rename, delete, Variables | Messages that need no answer |

## 5. Components

| Component | Rule |
| --------- | ---- |
| `Button` | `default` for the one main action of a view, `secondary` or `outline` for the others, `ghost` for toolbar and tree icons, `destructive` for Delete. An icon-only button has an `aria-label` and a `title`. Links that look like buttons use `buttonVariants()` on a `Link` |
| `Card` | Panels: overview groups, the Runs list, the Validation result, landing features |
| `Badge` | Short labels; the `success`, `warning`, `destructive`, `info` and `muted` variants are the status roles (2.3) |
| `ToggleGroup` | A choice among a few options shown at once, such as the theme |
| `Dialog` | Through the workspace dialogs only (frontend.md 1.6, 1.8, 1.11) |
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
7. Show the message next to its source, as visible text: under the field with `role="alert"`, `aria-invalid` and `aria-describedby`; diagnostics in the Validation result with their line.
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
| `components/ui/` | shadcn/ui components; their focus rings use `ring-ring` at full strength, and `Badge` has the status variants |

## 9. Test Plan

| Type | Coverage | Location |
| ---- | -------- | -------- |
| Unit | Every token pair of 2.2 in both themes | `src/tests/unit/app/frontend/design-tokens.test.ts` |
| E2E | The theme follows the system by default; a chosen theme persists after a reload; System follows the setting again; the stored theme is set before the page's scripts run; the switch is on the login page and in the workspace | `src/tests/e2e/theme.e2e.ts` |
