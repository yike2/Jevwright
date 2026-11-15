# The web workspace

The workspace is where you keep, edit and run your test files. It looks like a code editor: the sidebar on the left,
the editor in the middle, and two consoles on the right.

## Projects, folders and test files

The sidebar lists your **Projects**. A Project is a top-level folder, usually one per app you test, and holds your test
files directly or in **folders**. Folders can hold folders, up to 4 levels counting the Project.

| In the sidebar | What it does |
| --- | --- |
| **+** next to "Projects" | Adds a Project; type its name in place and press Enter |
| **+** on a Project or folder | **New folder**, **New test file**, or **Upload files…** |
| **Variables** under a Project | Opens the Project's Variables |
| Drag and drop | Moves a folder or test file to another Project or folder. Dropping `.yaml` files or folders from your computer imports them |
| **Rename**, **Delete**, **Move to…** | On every row; F2 renames the focused row |
| The icon in front of a file | The latest Run: passed, failed, running, or never run |

Names of Projects and folders can be up to 100 characters. Test file names use only letters, digits, `-`, `_` and `.`,
and end in `.yaml`. Uploading never overwrites a file: one whose name is taken is skipped with the reason.

A file's Runs stay with it when you rename or move it. Deleting a file deletes its history; a new file with the same
name starts fresh.

The workspace's home page lists every test file with the status of its latest Run.

## The editor

A test file opens in the editor, with YAML highlighting and line numbers. The badge next to the file name says whether
it is **Saved** or **Unsaved**, and how its latest Run ended.

| Do | How |
| --- | --- |
| Save | **Save** or `Ctrl+S` (`Cmd+S` on a Mac) |
| Run | **Run** or `Ctrl+Enter`; unsaved changes are saved first |
| Jump to a problem | Click it in the Debug console |

The file is checked as you type and when you save. Each problem is underlined on its line, with the message on hover.

## The Debug console

The **Debug console**, at the top right, lists the file's problems, one line each: `Line <line>: <message>` and the
problem's code, such as `E005`. "No problems" means the file is valid. A file with problems cannot run: **Run** answers
with the problems instead. The [Diagnostics](../reference/diagnostics.md) page explains every code and how to fix it.

When an agent wrote the file, copy the Debug console's lines and paste them back to the agent to fix.

## The Output console and Runs

The **Output console**, below the Debug console, follows the current Run live: its status, how many steps passed, and
one line per step with its status and, for a failed step, the reason. Below it, **Runs** lists the file's earlier Runs,
newest first.

Each console opens and collapses on its own from its header, and the toggle in the header or the status bar hides the
whole column, so the editor takes the full width.

## Reports

**Open run details**, or a Run in the list, opens the report beside the editor; **Open full page** opens it on its own
page. A report shows:

- the Run's status, when it started, its duration, and how many steps passed;
- every step, with its action, its line in the file, its status and duration, how its element was found (`selector`,
  `visual` or `dom`), and the reason when it failed;
- a screenshot of the page after each step; click it to see it full size;
- **Source when it ran**: the file as it was when the Run started, since you may have edited it since;
- **Download report**, the report as JSON, and **Download trace**, a Playwright trace. Open the trace at
  [trace.playwright.dev](https://trace.playwright.dev) to step through the Run with the page, its network requests and
  its console.

A Run stops at its first failed step; the steps after it stay **Pending**.

## Variables

A Variable is a named value that test files use as `{{NAME}}`, such as `baseUrl: "{{BASE}}"` or
`value: "{{APP_PASSWORD}}"`. Variables belong to a Project; every test file in the Project, in any folder, uses them.

Open **Variables** under a Project to add, change or delete them. Names use capital letters, digits and `_`, and do not
start with a digit. Values are hidden as `****` until you click the eye button.

When a Run starts, every `{{NAME}}` in the file is replaced with the Variable's value. A Variable the Project does not
have fails the step that uses it with `Variable {{NAME}} is not set`. Values are hidden in reports and failure reasons,
which show `{{NAME}}` instead.

## Themes

The workspace follows your system's light or dark setting. The theme switch next to your account, at the bottom of the
sidebar, picks **Light**, **Dark** or **System**.
