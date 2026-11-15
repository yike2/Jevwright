"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useTheme } from "next-themes";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { yaml } from "@codemirror/lang-yaml";
import { HighlightStyle, bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { Diagnostic } from "@/lib/api";
import { diagnosticRanges } from "@/lib/editor";

export type CodeEditorHandle = {
  /** Puts the cursor at the start of a line's text, scrolls it into view and focuses the editor. */
  goToLine(line: number): void;
};

type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onCursorChange: (cursor: { line: number; column: number }) => void;
  diagnostics: Diagnostic[];
  // The source the diagnostics were computed for; they are shown only while the editor holds that source.
  diagnosticsSource: string;
  label: string;
};

// Colors come from the design tokens (design-system.md 2.1), so the editor follows the theme with the rest of the page.
const highlight = HighlightStyle.define([
  { tag: [tags.propertyName, tags.definition(tags.propertyName)], color: "var(--syntax-key)" },
  { tag: [tags.string, tags.special(tags.string), tags.content], color: "var(--syntax-string)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.keyword], color: "var(--syntax-literal)" },
  { tag: [tags.comment, tags.lineComment], color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: [tags.meta, tags.punctuation, tags.separator], color: "var(--muted-foreground)" },
]);

const editorTheme = (dark: boolean) =>
  EditorView.theme(
    {
      "&": { height: "100%", backgroundColor: "var(--code)", color: "var(--code-foreground)", fontSize: "0.8125rem" },
      "&.cm-focused": { outline: "none" },
      ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
      ".cm-content": { caretColor: "var(--code-foreground)", padding: "8px 0" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--code-foreground)" },
      ".cm-gutters": { backgroundColor: "var(--code)", color: "var(--muted-foreground)", border: "none" },
      ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--accent)" },
      ".cm-activeLineGutter": { color: "var(--code-foreground)" },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection":
        { backgroundColor: "color-mix(in oklch, var(--ring) 30%, transparent)" },
      ".cm-lintRange-error": {
        backgroundImage: "none",
        textDecoration: "underline wavy var(--destructive)",
        textUnderlineOffset: "3px",
      },
      ".cm-lintPoint-error:after": { borderBottomColor: "var(--destructive)" },
      ".cm-lint-marker": { width: "0.6rem", height: "0.6rem", borderRadius: "9999px", content: "none" },
      ".cm-lint-marker-error": { backgroundColor: "var(--destructive)", content: "none" },
      ".cm-tooltip": {
        backgroundColor: "var(--popover)",
        color: "var(--popover-foreground)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
      },
      ".cm-diagnostic-error": { borderLeftColor: "var(--destructive)" },
      ".cm-diagnosticSource": { color: "var(--muted-foreground)" },
    },
    { dark },
  );

/** The YAML editor: CodeMirror 6 with highlighting, line numbers and the diagnostics marked on their lines. */
export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  { value, onChange, onCursorChange, diagnostics, diagnosticsSource, label },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeRef = useRef(new Compartment());
  const callbacks = useRef({ onChange, onCursorChange });
  callbacks.current = { onChange, onCursorChange };
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          indentOnInput(),
          bracketMatching(),
          yaml(),
          syntaxHighlighting(highlight),
          lintGutter(),
          EditorState.tabSize.of(2),
          // Tab indents; Escape then Tab moves the focus on, as CodeMirror documents for keyboard users.
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.contentAttributes.of({ "aria-label": label, spellcheck: "false" }),
          themeRef.current.of(editorTheme(false)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
            if (update.docChanged || update.selectionSet) {
              const head = update.state.selection.main.head;
              const line = update.state.doc.lineAt(head);
              callbacks.current.onCursorChange({ line: line.number, column: head - line.from + 1 });
            }
          }),
        ],
      }),
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The view is created once; later values, the label aside, arrive through the effects below.
  }, []);

  // A value from outside (a save that answered another source, a reload) replaces the document.
  useEffect(() => {
    const view = viewRef.current;
    if (view === null || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeRef.current.reconfigure(editorTheme(resolvedTheme === "dark")) });
  }, [resolvedTheme]);

  useEffect(() => {
    const view = viewRef.current;
    if (view === null || view.state.doc.toString() !== diagnosticsSource) return;
    const marks = diagnosticRanges(diagnosticsSource, diagnostics).map((range) => ({
      from: range.from,
      to: range.to,
      severity: "error" as const,
      message: range.message,
      source: range.code,
    }));
    view.dispatch(setDiagnostics(view.state, marks));
  }, [diagnostics, diagnosticsSource]);

  useImperativeHandle(ref, () => ({
    goToLine(lineNumber: number) {
      const view = viewRef.current;
      if (view === null) return;
      const line = view.state.doc.line(Math.min(Math.max(lineNumber, 1), view.state.doc.lines));
      const indent = line.text.length - line.text.trimStart().length;
      view.dispatch({ selection: { anchor: line.from + indent }, scrollIntoView: true });
      view.focus();
    },
  }));

  return <div ref={hostRef} className="h-full min-h-0 overflow-hidden" />;
});
