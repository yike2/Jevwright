"use client";

import { useRef } from "react";
import { FilePlus, FolderPlus, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AddMenuProps = {
  // The Project's or folder's name, for the button's accessible name.
  name: string;
  // False for a folder at level 4, which cannot hold another folder.
  canAddFolder: boolean;
  onNewFolder: () => void;
  onNewTestFile: () => void;
  onUpload: () => void;
};

/**
 * A Project's or folder's "+" menu (frontend.md 1.6): New folder, New test file, Upload files…. A choice runs once
 * the menu has closed, so a name input it opens keeps the focus instead of the "+" getting it back.
 */
export function AddMenu({ name, canAddFolder, onNewFolder, onNewTestFile, onUpload }: AddMenuProps) {
  // The chosen item, and whether the "+" gets the focus back: not when a name input opens.
  const chosen = useRef<{ action: () => void; returnFocus: boolean } | null>(null);
  const choose = (action: () => void, returnFocus: boolean) => () => {
    chosen.current = { action, returnFocus };
  };

  return (
    <DropdownMenu
      onOpenChangeComplete={(open) => {
        if (open) return;
        const choice = chosen.current;
        chosen.current = null;
        choice?.action();
      }}
    >
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="icon-xs" aria-label={`New in ${name}`} title="New…" />}
      >
        <Plus aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto" finalFocus={() => chosen.current?.returnFocus ?? true}>
        {canAddFolder && (
          <DropdownMenuItem onClick={choose(onNewFolder, false)}>
            <FolderPlus aria-hidden="true" />
            New folder
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={choose(onNewTestFile, false)}>
          <FilePlus aria-hidden="true" />
          New test file
        </DropdownMenuItem>
        <DropdownMenuItem onClick={choose(onUpload, true)}>
          <Upload aria-hidden="true" />
          Upload files…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
