# The web workspace

The workspace is where you keep, edit and run your test files. It looks like a code editor: the sidebar on the left (1),
the editor in the middle (2), and two consoles on the right, the **Debug console** (3) above the **Output console** (4)
with the file's **History** (5). The status bar (6) runs along the bottom.

![The workspace with a test file open, with markers on the sidebar (1), the editor (2), the Debug console (3), the Output console (4), History (5) and the status bar (6)](/screenshots/workspace-layout.webp)

## Projects, folders and test files

The sidebar lists your **Projects**. A Project is a top-level folder, usually one per app you test, and holds your test
files directly or in **folders**. Folders can hold folders, up to 4 levels counting the Project.

![The sidebar with markers on the + next to Projects (1), the menu of a folder's + with New folder, New test file and Upload files… (2), and the status icons of a passed file (3) and a failed file (4)](/screenshots/sidebar.webp)

| In the sidebar | What it does |
| --- | --- |
| **+** next to "Projects" (1) | Adds a Project; type its name in place and press Enter |
| **+** on a Project or folder | Opens a menu (2) with **New folder**, **New test file**, and **Upload files…** |
| The key icon on a Project's row | Opens the Project's Variables |
| Drag and drop | Moves a folder or test file to another Project or folder. Dropping `.yaml` files or folders from your computer imports them |
| **Rename**, **Delete**, **Move to…** | On every row; F2 renames the focused row |
| The icon in front of a file | The latest Run: passed (3), failed (4), running, or never run (a dashed circle) |

Names of Projects and folders can be up to 100 characters. Test file names use only letters, digits, `-`, `_` and `.`,
and end in `.yaml`. Uploading never overwrites a file: one whose name is taken is skipped with the reason.

A file's Runs stay with it when you rename or move it. Deleting a file deletes its history; a new file with the same
name starts fresh.

The workspace's home page lists every test file with the status of its latest Run.

## The editor

A test file opens in the editor, with YAML highlighting and line numbers. The badge next to the file name (1) says
whether it is **Saved** or **Unsaved**, and how its latest Run ended.

![The editor's header, with markers on the file's badge "Passed" (1), Save (2), Run (3) and the button that hides the consoles (4)](/screenshots/editor-header.webp)

| Do | How |
| --- | --- |
| Save | **Save** (2) or `Ctrl+S` (`Cmd+S` on a Mac) |
| Run | **Run** (3) or `Ctrl+Enter`; unsaved changes are saved first |
| Hide or show the consoles | The button at the top right (4), or the same button at the right of the status bar |
| Jump to a problem | Click it in the Debug console |

The file is checked as you type and when you save. Each problem is underlined on its line, with the message on hover.

## The Debug console

The **Debug console**, at the top right, lists the file's problems, one line each (2): `Line <line>: <message>` and
the problem's code, such as `E005`. The editor underlines each of those lines (1).

![A file with seven problems, with markers on the underlined line 5 in the editor (1) and its problem at the top of the Debug console (2)](/screenshots/diagnostics.webp)

 "No problems" means the file is valid. A file with problems cannot run: **Run** answers
with the problems instead. The [Diagnostics](../reference/diagnostics.md) page explains every code and how to fix it.

When an agent wrote the file, copy the Debug console's lines and paste them back to the agent to fix.

## The Output console and Runs

The **Output console**, below the Debug console, follows the current Run live: its status (1), how many steps passed,
and one line per step with its status: **Passed** (2), **Running** (3), **Pending** (4) or **Failed**, with the reason
of a failed step. Below it, **History** lists the file's Runs, newest first.

![The Output console during a Run, with markers on the Running badge (1), the passed step 1 (2), the running step 2 (3) and the pending steps 3 to 8 (4)](/screenshots/run-live.webp)

Each console opens and collapses on its own from its header, and the toggle in the header or the status bar hides the
whole column, so the editor takes the full width.

## Reports

**Open run details**, or a Run in History, opens the report beside the editor; **Open full page** (2) opens it on its
own page. A report shows:

![A report beside the editor, with markers on the status (1), Open full page (2), Download report (3), the screenshot of step 1 (4) and the locate method "selector" of step 2 (5)](/screenshots/report.webp)

- the Run's status, when it started, its duration, and how many steps passed (1);
- every step, with its action, its line in the file, its status and duration, how its element was found (`selector`,
  `visual` or `dom`) (5), and the reason when it failed;
- a screenshot of the page after each step (4); click it to see it full size;
- **Source when it ran**: the file as it was when the Run started, since you may have edited it since;
- **Download report** (3), the report as JSON, and **Download trace**, a Playwright trace. Open the trace at
  [trace.playwright.dev](https://trace.playwright.dev) to step through the Run with the page, its network requests and
  its console.

A Run stops at its first failed step; the steps after it stay **Pending**.

## Variables

A Variable is a named value that test files use as `{{NAME}}`, such as `baseUrl: "{{BASE}}"` or
`value: "{{APP_PASSWORD}}"`. Variables belong to a Project; every test file in the Project, in any folder, uses them.

Click the key icon on a Project's row in the sidebar to open its Variables. Each Variable is one row (1); its value is
hidden as `****` until you click the eye button (2). To add a Variable, or to change one, type its **Name** (3) and
**Value** (4) and click **Save** (5); saving a name that exists replaces its value. **Delete** next to a Variable removes
it. Names use capital letters, digits and `_`, and do not start with a digit.

![The Variables page of the Quick Start project, with markers on the row of BASE (1), its eye button (2), the Name field (3), the Value field (4) and Save (5)](/screenshots/variables.webp)

When a Run starts, every `{{NAME}}` in the file is replaced with the Variable's value. A Variable the Project does not
have fails the step that uses it with `Variable {{NAME}} is not set`. Values are hidden in reports and failure reasons,
which show `{{NAME}}` instead.

## Themes

The workspace follows your system's light or dark setting. The theme switch next to your account, at the bottom of the
sidebar, picks **Light**, **Dark** or **System**.
