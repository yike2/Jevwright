"use client";

import { useEffect, useState } from "react";
import { useDefaultLayout, type LayoutStorage } from "react-resizable-panels";
import { parseConsoleSplit, parseConsolesOpen, type ConsolesOpen } from "./editor.js";

// Sizes are kept per browser; a browser that blocks storage still gets the default sizes.
const storage: LayoutStorage = {
  getItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Not kept: the next visit starts from the default sizes.
    }
  },
};

/** The stored layout of a resizable group and the callback that stores its changes, under `jevwright:<id>`. */
export function usePanelLayout(id: string) {
  return useDefaultLayout({ id: `jevwright:${id}`, storage });
}

const CONSOLES_KEY = "jevwright:consoles-open";

/** Which of the editor's consoles are open, kept per browser under `jevwright:consoles-open`. */
export function useConsolesOpen() {
  const [open, setOpen] = useState<ConsolesOpen>(() => parseConsolesOpen(storage.getItem(CONSOLES_KEY)));
  useEffect(() => {
    storage.setItem(CONSOLES_KEY, JSON.stringify(open));
  }, [open]);
  return [open, setOpen] as const;
}

const SPLIT_KEY = "jevwright:console-split";

/**
 * The Debug console's share of the column, in percent, while both consoles are open, kept per browser under
 * `jevwright:console-split`, so collapsing and reopening a console, or a reload, restores the last dragged split.
 */
export function useConsoleSplit() {
  const [split, setSplit] = useState(() => parseConsoleSplit(storage.getItem(SPLIT_KEY)));
  useEffect(() => {
    storage.setItem(SPLIT_KEY, String(split));
  }, [split]);
  return [split, setSplit] as const;
}
