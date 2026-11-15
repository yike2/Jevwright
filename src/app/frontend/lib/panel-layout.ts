"use client";

import { useDefaultLayout, type LayoutStorage } from "react-resizable-panels";

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
