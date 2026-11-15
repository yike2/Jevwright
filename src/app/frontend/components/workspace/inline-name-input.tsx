"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { errorText } from "@/lib/format-error";
import { cn } from "cn";

type InlineNameInputProps = {
  // The name shown when the input opens, all selected; empty for a new row.
  initialName: string;
  // What is wrong with the typed name, shown under the input as the user types.
  validate: (name: string) => string | null;
  // Saves the name; a rejection keeps the input open with its message.
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
  // A fixed suffix shown after the input, as a file manager shows an extension it does not select.
  suffix?: ".yaml";
  className?: string;
};

/**
 * A tree row's name as an input in place, like a file manager's rename (frontend.md 1.6): Enter or a click away
 * saves, Escape cancels and restores the name.
 */
export function InlineNameInput({
  initialName,
  validate,
  onSubmit,
  onCancel,
  suffix,
  className,
}: InlineNameInputProps) {
  const inputId = useId();
  const problemId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(initialName);
  // An empty new name is not a problem until the user types or tries to save.
  const [touched, setTouched] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const problem = validate(name);
  const shown = saveError ?? (touched ? problem : null);

  const finish = async (trigger: "enter" | "blur") => {
    if (done.current || isSaving) return;
    if (name.trim() === initialName.trim()) {
      // Enter on an empty new row says what is missing; a click away from it, or an unchanged name, saves nothing.
      if (initialName.trim() === "" && trigger === "enter") {
        setTouched(true);
        return;
      }
      done.current = true;
      onCancel();
      return;
    }
    setTouched(true);
    if (problem !== null) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      await onSubmit(name);
      done.current = true;
    } catch (error) {
      setSaveError(errorText(error));
      setIsSaving(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void finish("enter");
    } else if (event.key === "Escape") {
      event.preventDefault();
      done.current = true;
      onCancel();
    }
  };

  return (
    <div className={cn("min-w-0 flex-1 py-0.5", className)}>
      <div className="flex items-center gap-0.5">
        <label htmlFor={inputId} className="sr-only">
          Name
        </label>
        <input
          ref={inputRef}
          id={inputId}
          value={name}
          readOnly={isSaving}
          onChange={(event) => {
            setName(event.target.value);
            setTouched(true);
            setSaveError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => void finish("blur")}
          aria-invalid={shown !== null}
          aria-describedby={shown !== null ? problemId : undefined}
          className="h-6 min-w-0 flex-1 rounded-sm border border-ring bg-background px-1 text-sm text-foreground aria-invalid:border-destructive"
        />
        {suffix && (
          <span aria-hidden="true" className="font-mono text-[0.8125rem] text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {shown !== null && (
        <p
          id={problemId}
          role="alert"
          className="mt-1 rounded-sm bg-destructive/12 px-1 py-0.5 text-xs text-destructive"
        >
          {shown}
        </p>
      )}
    </div>
  );
}
