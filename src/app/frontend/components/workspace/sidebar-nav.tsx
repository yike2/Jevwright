"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { apiClient } from "@/lib/api";
import {
  confirmDeleteText,
  deletesTestFile,
  hasQuickStart,
  initials,
  starterSource,
  statusOf,
  statusTitle,
  testFileBaseName,
  toTestFileName,
  type DeleteTarget,
  type DeleteTargetKind,
} from "@/lib/sidebar";
import {
  canAddFolder,
  childFolderId,
  moveDestinations,
  parentOf,
  type Destination,
  type Movable,
  type Parent,
  type TreeFolder,
  type TreeProject,
  type TreeTestFile,
} from "@/lib/tree";
import { importEntries, importSummary, type ImportEntry, type ImportResult } from "@/lib/import";
import { readDroppedEntries, type DroppedEntry } from "@/lib/drop-entries";
import { errorText } from "@/lib/format-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { nameProblem, testFileNameProblem } from "@/lib/validation";
import { AddMenu } from "@/components/workspace/add-menu";
import { AddQuickStart } from "@/components/workspace/add-quick-start";
import { ConfirmDeleteDialog } from "@/components/workspace/confirm-delete-dialog";
import { InlineNameInput } from "@/components/workspace/inline-name-input";
import { MoveDialog } from "@/components/workspace/move-dialog";
import { TreeNameTooltip } from "@/components/workspace/tree-name";
import { ChevronRight, FolderInput, KeyRound, LogOut, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "cn";
import { WORKSPACE_HOME } from "@/lib/routes";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandMark } from "@/components/landing/brand-mark";
import { StatusIcon } from "@/components/workspace/status-badge";

type WorkspaceSidebarProps = {
  email: string;
  tree: TreeProject[];
  refreshTree: () => Promise<void>;
  onLogout: () => void;
  onNavigate?: () => void;
};

// The one row being named in place: an existing row being renamed, or a new row under its parent.
type Editing =
  | { mode: "rename"; kind: DeleteTargetKind; id: string; name: string }
  | { mode: "create"; kind: "project" }
  | { mode: "create"; kind: "folder" | "testFile"; parent: Parent };

type Row = DeleteTarget & { name: string };
type MovableRow = Movable & { name: string };

// A Project or folder as a parent: where it is, its level (1 for a Project), and its path, e.g. "Shop / checkout".
type Place = { parent: Parent; level: number; label: string };

// The sidebar's messages: an import's result, a move, or a move the backend refused.
type Notice =
  { kind: "import"; result: ImportResult } | { kind: "moved"; text: string } | { kind: "error"; text: string };

// The row a drag is over, and whether dropping there moves a row of the tree or imports files from the computer.
type DropTarget = { id: string; action: "move" | "import" };

// The drag data of a tree row; files from the computer come as "Files".
const ROW_TYPE = "application/x-jevwright-row";

const KIND_WORDS: Record<DeleteTargetKind, string> = { project: "project", folder: "folder", testFile: "test file" };
const DELETE_TITLES = { project: "Delete project", folder: "Delete folder", testFile: "Delete test file" } as const;

// A Project's or folder's own id names its row, its open state, and its place as a parent.
const idOf = (parent: Parent) => parent.folderId ?? parent.projectId;

export function SidebarNav({ email, tree, refreshTree, onLogout, onNavigate }: WorkspaceSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTarget = useRef<Place | null>(null);
  const dragged = useRef<MovableRow | null>(null);

  // Projects and folders are open by default, including the ones added later; this holds the closed ones.
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [moving, setMoving] = useState<MovableRow | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [dragAnnouncement, setDragAnnouncement] = useState("");

  const currentFileId = pathname?.startsWith("/files/") ? pathname.slice("/files/".length) : null;
  const currentProjectId = /^\/projects\/([^/]+)\/variables$/.exec(pathname ?? "")?.[1] ?? null;

  const isOpen = (id: string) => !closed.has(id);
  const setOpen = (id: string, open: boolean) =>
    setClosed((previous) => {
      const next = new Set(previous);
      if (open) next.delete(id);
      else next.add(id);
      return next;
    });

  const startCreate = (next: Editing) => {
    if (next.mode === "create" && next.kind !== "project") setOpen(idOf(next.parent), true);
    setEditing(next);
  };

  // F2 renames the focused row, as in a file manager.
  const renameOnF2 = (target: Extract<Editing, { mode: "rename" }>) => (event: KeyboardEvent) => {
    if (event.key === "F2") {
      event.preventDefault();
      setEditing(target);
    }
  };

  const refreshQuietly = async () => {
    try {
      await refreshTree();
    } catch {
      // The change is done; the tree catches up on its next refresh.
    }
  };

  const openFile = (testFileId: string) => {
    router.push(`/files/${testFileId}`);
    onNavigate?.();
  };

  const handleCreate = async (target: Extract<Editing, { mode: "create" }>, name: string) => {
    if (target.kind === "testFile") {
      const fileName = toTestFileName(name);
      const created = await apiClient.createTestFile(target.parent, fileName, starterSource(fileName));
      setEditing(null);
      await refreshQuietly();
      openFile(created.testFile.id);
      return;
    }
    if (target.kind === "project") await apiClient.createProject(name);
    else await apiClient.createFolder(target.parent, name);
    setEditing(null);
    await refreshQuietly();
  };

  const handleRename = async (target: Extract<Editing, { mode: "rename" }>, name: string) => {
    if (target.kind === "project") {
      await apiClient.renameProject(target.id, name);
    } else if (target.kind === "folder") {
      await apiClient.renameFolder(target.id, name);
    } else {
      await apiClient.renameTestFile(target.id, toTestFileName(name));
    }
    setEditing(null);
    await refreshQuietly();
  };

  const handleDelete = async () => {
    if (deleteTarget === null) {
      return;
    }

    if (deleteTarget.kind === "project") {
      await apiClient.deleteProject(deleteTarget.id);
    } else if (deleteTarget.kind === "folder") {
      await apiClient.deleteFolder(deleteTarget.id);
    } else {
      await apiClient.deleteTestFile(deleteTarget.id);
    }

    const leavesCurrentPage =
      deletesTestFile({ items: tree }, deleteTarget, currentFileId) ||
      (deleteTarget.kind === "project" && deleteTarget.id === currentProjectId);
    if (leavesCurrentPage) {
      router.replace(WORKSPACE_HOME);
      onNavigate?.();
    }

    await refreshQuietly();
  };

  // Moves a folder or Test File; the backend refuses a taken name, a folder into itself, or more than 4 levels.
  const move = async (row: MovableRow, to: Destination) => {
    if (row.kind === "folder") await apiClient.moveFolder(row.id, to);
    else await apiClient.moveTestFile(row.id, to);
    setOpen(idOf(to), true);
    setNotice({ kind: "moved", text: `Moved ${row.name} to ${to.label}.` });
    await refreshQuietly();
  };

  const dropRow = async (row: MovableRow, to: Destination) => {
    const from = parentOf(tree, row);
    if (from?.projectId === to.projectId && from.folderId === to.folderId) return;
    try {
      await move(row, to);
    } catch (error) {
      setNotice({ kind: "error", text: `${row.name} was not moved. ${errorText(error)}` });
    }
  };

  const runImport = async ({ parent, level }: Place, entries: ImportEntry[], openSingle: boolean) => {
    setNotice(null);
    const result = await importEntries({ ...parent, level }, entries, {
      createFolder: (where, name) => apiClient.createFolder(where, name),
      createTestFile: (where, name, source) => apiClient.createTestFile(where, name, source),
      existingFolder: (where, name) => childFolderId(tree, where, name),
    });
    setOpen(idOf(parent), true);
    setNotice({ kind: "import", result });
    await refreshQuietly();
    // One uploaded file opens, as a new Test File does.
    const [only] = result.imported;
    if (openSingle && only !== undefined && result.imported.length === 1 && result.skipped.length === 0) openFile(only);
  };

  const startUpload = (place: Place) => {
    uploadTarget.current = place;
    fileInputRef.current?.click();
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    const place = uploadTarget.current;
    event.target.value = "";
    if (files.length === 0 || place === null) return;
    await runImport(
      place,
      files.map((file): ImportEntry => ({ kind: "file", path: file.name, file })),
      true,
    );
  };

  // Drag and drop (frontend.md 1.6): a folder or Test File dragged onto a Project or folder moves there, and files or
  // folders dropped from the computer are imported there.
  const dropActionOf = (event: DragEvent): DropTarget["action"] | null => {
    const types = [...event.dataTransfer.types];
    if (types.includes(ROW_TYPE) && dragged.current !== null) return "move";
    if (types.includes("Files")) return "import";
    return null;
  };

  const dragProps = (row: MovableRow) => ({
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData(ROW_TYPE, row.id);
      event.dataTransfer.effectAllowed = "move";
      dragged.current = row;
    },
    onDragEnd: () => {
      dragged.current = null;
      setDropTarget(null);
      setDragAnnouncement("");
    },
  });

  const dropFiles = (place: Place, event: DragEvent) => {
    // A drop's items can be read only during its event, so their entries are taken before anything waits. A browser
    // without entries for an item still gives its file.
    const roots: DroppedEntry[] = [];
    const loose: ImportEntry[] = [];
    for (const item of [...event.dataTransfer.items].filter((candidate) => candidate.kind === "file")) {
      const entry = item.webkitGetAsEntry();
      const file = entry === null ? item.getAsFile() : null;
      if (entry !== null) roots.push(entry);
      else if (file !== null) loose.push({ kind: "file", path: file.name, file });
    }
    void (async () => {
      await runImport(place, [...loose, ...(await readDroppedEntries(roots))], false);
    })();
  };

  const dropProps = (place: Place) => {
    const id = idOf(place.parent);
    return {
      onDragOver: (event: DragEvent) => {
        const action = dropActionOf(event);
        if (action === null) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = action === "move" ? "move" : "copy";
        if (dropTarget?.id === id && dropTarget.action === action) return;
        setDropTarget({ id, action });
        setDragAnnouncement(
          action === "move"
            ? `Drop to move ${dragged.current?.name ?? ""} to ${place.label}.`
            : `Drop to import into ${place.label}.`,
        );
      },
      onDragLeave: (event: DragEvent) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDropTarget((previous) => (previous?.id === id ? null : previous));
      },
      onDrop: (event: DragEvent) => {
        const action = dropActionOf(event);
        if (action === null) return;
        event.preventDefault();
        setDropTarget(null);
        setDragAnnouncement("");
        const row = dragged.current;
        dragged.current = null;
        if (action === "move" && row !== null) void dropRow(row, { ...place.parent, label: place.label });
        else dropFiles(place, event);
      },
    };
  };

  const renaming = (kind: DeleteTargetKind, id: string) =>
    editing?.mode === "rename" && editing.kind === kind && editing.id === id ? editing : null;

  const newRow = (kind: "project" | "folder" | "testFile", parent?: Parent) => {
    if (editing?.mode !== "create" || editing.kind !== kind) return null;
    if (editing.kind !== "project" && (parent === undefined || idOf(editing.parent) !== idOf(parent))) return null;
    const target = editing;
    return (
      <div className="flex h-8 items-center rounded-md px-1">
        <InlineNameInput
          initialName=""
          validate={kind === "testFile" ? testFileNameProblem : nameProblem}
          suffix={kind === "testFile" ? ".yaml" : undefined}
          onSubmit={(name) => handleCreate(target, name)}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  };

  const renameInput = (target: Extract<Editing, { mode: "rename" }>) => (
    <InlineNameInput
      initialName={target.kind === "testFile" ? testFileBaseName(target.name) : target.name}
      validate={target.kind === "testFile" ? testFileNameProblem : nameProblem}
      suffix={target.kind === "testFile" ? ".yaml" : undefined}
      onSubmit={(name) => handleRename(target, name)}
      onCancel={() => setEditing(null)}
      className="px-1"
    />
  );

  // Row actions stay in the accessibility tree; with a mouse they show on hover or focus, on touch always.
  const rowAction =
    "pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100";

  const rowButtons = (row: Row, extra?: ReactNode) => {
    const { kind } = row;
    const movable: MovableRow | null = kind === "project" ? null : { kind, id: row.id, name: row.name };
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={rowAction}
          aria-label={`Rename ${KIND_WORDS[row.kind]} ${row.name}`}
          title="Rename (F2)"
          onClick={() => setEditing({ mode: "rename", ...row })}
        >
          <Pencil />
        </Button>
        {movable && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={rowAction}
            aria-label={`Move ${KIND_WORDS[row.kind]} ${row.name}`}
            title="Move to…"
            onClick={() => setMoving(movable)}
          >
            <FolderInput />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={rowAction}
          aria-label={`Delete ${KIND_WORDS[row.kind]} ${row.name}`}
          title="Delete"
          onClick={() => setDeleteTarget(row)}
        >
          <Trash2 />
        </Button>
        {extra}
      </>
    );
  };

  // A drop target gets an outline and says what a drop does, so the highlight is not color alone.
  const dropHighlight = (id: string) => dropTarget?.id === id && "bg-accent ring-2 ring-ring ring-inset";
  const dropHint = (id: string) =>
    dropTarget?.id === id && (
      <span aria-hidden="true" className="shrink-0 px-1 text-xs font-medium text-info">
        {dropTarget.action === "move" ? "Move here" : "Import here"}
      </span>
    );

  const addMenu = (place: Place, name: string) => (
    <AddMenu
      name={name}
      canAddFolder={canAddFolder(place.level)}
      onNewFolder={() => startCreate({ mode: "create", kind: "folder", parent: place.parent })}
      onNewTestFile={() => startCreate({ mode: "create", kind: "testFile", parent: place.parent })}
      onUpload={() => startUpload(place)}
    />
  );

  const toggleButton = (id: string, target: Extract<Editing, { mode: "rename" }>, bold: boolean) => (
    <TreeNameTooltip name={target.name}>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          "min-w-0 flex-1 justify-start gap-1 px-1 hover:bg-transparent aria-expanded:bg-transparent",
          bold && "font-semibold",
        )}
        aria-expanded={isOpen(id)}
        onClick={() => setOpen(id, !isOpen(id))}
        onKeyDown={renameOnF2(target)}
      >
        <ChevronRight
          aria-hidden="true"
          className={cn("transition-transform motion-reduce:transition-none", isOpen(id) && "rotate-90")}
        />
        <span data-tree-name className="truncate">
          {target.name}
        </span>
      </Button>
    </TreeNameTooltip>
  );

  // What sits in a Project or folder: a new folder's row and the folders, then a new file's row and the files.
  const contents = (node: { folders: TreeFolder[]; testFiles: TreeTestFile[] }, place: Place) => (
    <div className="ml-3 border-l border-sidebar-border pl-1">
      {newRow("folder", place.parent)}
      {node.folders.map((folder) => folderNode(folder, place))}
      {newRow("testFile", place.parent)}
      {node.testFiles.map(testFileRow)}
    </div>
  );

  const folderNode = (folder: TreeFolder, parentPlace: Place) => {
    const place: Place = {
      parent: { projectId: folder.projectId, folderId: folder.id },
      level: parentPlace.level + 1,
      label: `${parentPlace.label} / ${folder.name}`,
    };
    const row = { kind: "folder", id: folder.id, name: folder.name } as const;
    const rename = renaming("folder", folder.id);

    return (
      <div key={folder.id}>
        <div
          className={cn(
            "group/row flex min-h-8 items-center gap-0.5 rounded-md hover:bg-accent",
            dropHighlight(folder.id),
          )}
          {...(rename ? {} : dragProps(row))}
          {...dropProps(place)}
        >
          {rename ? renameInput(rename) : toggleButton(folder.id, { mode: "rename", ...row }, false)}
          {dropHint(folder.id)}
          {rowButtons(row, addMenu(place, folder.name))}
        </div>
        {isOpen(folder.id) && contents(folder, place)}
      </div>
    );
  };

  const testFileRow = (testFile: TreeTestFile) => {
    const dot = statusOf(testFile.latestRun);
    const isCurrent = currentFileId === testFile.id;
    const row = { kind: "testFile", id: testFile.id, name: testFile.name } as const;
    const rename = renaming("testFile", testFile.id);

    return (
      <div
        key={testFile.id}
        className={cn(
          "group/row flex min-h-7 items-center gap-0.5 rounded-md hover:bg-accent",
          isCurrent && "bg-sidebar-accent hover:bg-sidebar-accent",
        )}
        {...(rename ? {} : dragProps(row))}
      >
        {rename ? (
          renameInput(rename)
        ) : (
          <TreeNameTooltip name={testFile.name}>
            <Link
              href={`/files/${testFile.id}`}
              draggable={false}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 font-mono text-[0.8125rem]"
              aria-current={isCurrent ? "page" : undefined}
              onClick={() => onNavigate?.()}
              onKeyDown={renameOnF2({ mode: "rename", ...row })}
            >
              <span aria-hidden="true" data-status={dot} title={statusTitle(dot)}>
                <StatusIcon status={dot} />
              </span>
              <span data-tree-name className="truncate">
                {testFile.name}
              </span>
            </Link>
          </TreeNameTooltip>
        )}
        {rowButtons(row)}
      </div>
    );
  };

  const projectNode = (project: TreeProject) => {
    const place: Place = { parent: { projectId: project.id, folderId: null }, level: 1, label: project.name };
    const row = { kind: "project", id: project.id, name: project.name } as const;
    const rename = renaming("project", project.id);

    return (
      <div key={project.id}>
        <div
          className={cn(
            "group/row flex min-h-8 items-center gap-0.5 rounded-md hover:bg-accent",
            dropHighlight(project.id),
          )}
          {...dropProps(place)}
        >
          {rename ? renameInput(rename) : toggleButton(project.id, { mode: "rename", ...row }, true)}
          {dropHint(project.id)}
          {rowButtons(
            row,
            <>
              <Link
                href={`/projects/${project.id}/variables`}
                aria-label={`Variables for ${project.name}`}
                title={`Variables for ${project.name}`}
                aria-current={currentProjectId === project.id ? "page" : undefined}
                className={buttonVariants({ variant: "ghost", size: "icon-xs" })}
                onClick={() => onNavigate?.()}
              >
                <KeyRound aria-hidden="true" />
              </Link>
              {addMenu(place, project.name)}
            </>,
          )}
        </div>
        {isOpen(project.id) && contents(project, place)}
      </div>
    );
  };

  const dismiss = (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label="Dismiss"
      title="Dismiss"
      onClick={() => setNotice(null)}
    >
      <X aria-hidden="true" />
    </Button>
  );

  return (
    <>
      <div className="flex h-full flex-col">
        {/* The brand sits outside the "Projects" navigation, whose links are only the tree's Test Files. */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
          <Link
            href="/"
            aria-label="Jevwright home"
            className="flex items-center gap-2 rounded-md font-heading font-semibold"
            onClick={() => onNavigate?.()}
          >
            <BrandMark />
            Jevwright
          </Link>
        </div>
        <nav aria-label="Projects" className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Projects</h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="New project"
              title="New project"
              onClick={() => startCreate({ mode: "create", kind: "project" })}
            >
              <Plus aria-hidden="true" />
            </Button>
          </div>

          {/* What a drop would do, for screen readers; the row itself shows it too. */}
          <p className="sr-only" aria-live="polite">
            {dragAnnouncement}
          </p>
          <div role="status" aria-label="Sidebar messages" className="px-3">
            {(notice?.kind === "import" || notice?.kind === "moved") && (
              <div className="mb-1 rounded-md bg-muted px-2 py-1.5 text-xs">
                <div className="flex items-start gap-1">
                  <p className="min-w-0 flex-1">
                    {notice.kind === "import" ? importSummary(notice.result) : notice.text}
                  </p>
                  {dismiss}
                </div>
                {notice.kind === "import" && notice.result.skipped.length > 0 && (
                  <ul aria-label="Skipped" className="mt-1 space-y-0.5">
                    {notice.result.skipped.map((skipped) => (
                      <li key={skipped.path} className="break-words">
                        <span className="font-mono">{skipped.path}</span>: {skipped.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          {notice?.kind === "error" && (
            <div className="mx-3 mb-1 flex items-start gap-1 rounded-md bg-destructive/12 px-2 py-1.5 text-xs text-destructive">
              <p role="alert" className="min-w-0 flex-1">
                {notice.text}
              </p>
              {dismiss}
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-1 overflow-auto px-2 pb-3">
            {newRow("project")}
            {tree.map(projectNode)}
            {!hasQuickStart(tree) && <AddQuickStart onAdded={refreshTree} variant="outline" className="px-1 pt-2" />}
          </div>

          <section aria-label={`Signed in as ${email}`} className="space-y-3 border-t border-sidebar-border p-3">
            <div className="flex items-center gap-3">
              <div
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
              >
                {initials(email)}
              </div>
              {/* The email is the account's name; the region's label says it is the signed-in account. */}
              <TreeNameTooltip name={email}>
                <p data-tree-name tabIndex={0} className="min-w-0 flex-1 truncate rounded-sm">
                  {email}
                </p>
              </TreeNameTooltip>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ThemeToggle />
              <Button type="button" variant="outline" size="sm" onClick={onLogout}>
                <LogOut data-icon="inline-start" aria-hidden="true" />
                Log out
              </Button>
            </div>
          </section>
        </nav>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".yaml,.yml"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          void handleUpload(event);
        }}
      />

      <MoveDialog
        key={moving ? `${moving.kind}-${moving.id}` : "move-none"}
        name={moving?.name ?? null}
        destinations={moving ? moveDestinations(tree, moving) : []}
        onMove={(destination) => (moving ? move(moving, destination) : Promise.resolve())}
        onClose={() => setMoving(null)}
      />

      <ConfirmDeleteDialog
        key={deleteTarget ? `${deleteTarget.kind}-${deleteTarget.id}` : "delete-none"}
        open={deleteTarget !== null}
        title={DELETE_TITLES[deleteTarget?.kind ?? "testFile"]}
        message={deleteTarget ? confirmDeleteText(deleteTarget.kind, deleteTarget.name) : ""}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        onDelete={handleDelete}
      />
    </>
  );
}
