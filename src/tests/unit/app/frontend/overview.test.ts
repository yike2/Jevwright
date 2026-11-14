import { describe, expect, it } from "vitest";

import type { TreeResponse } from "@/app/frontend/lib/api.js";
import { overviewGroups } from "@/app/frontend/lib/overview.js";

describe("overviewGroups", () => {
  const tree: TreeResponse = {
    items: [
      {
        id: "p-1",
        name: "Shop",
        createdAt: "2026-11-13T00:00:00.000Z",
        updatedAt: "2026-11-13T00:00:00.000Z",
        modules: [
          {
            id: "m-1",
            projectId: "p-1",
            name: "Auth",
            createdAt: "2026-11-13T00:00:00.000Z",
            updatedAt: "2026-11-13T00:00:00.000Z",
            testFiles: [
              {
                id: "tf-1",
                moduleId: "m-1",
                name: "login.yaml",
                createdAt: "2026-11-13T00:00:00.000Z",
                updatedAt: "2026-11-13T00:00:00.000Z",
                latestRun: null,
              },
            ],
          },
          {
            id: "m-empty",
            projectId: "p-1",
            name: "Empty",
            createdAt: "2026-11-13T00:00:00.000Z",
            updatedAt: "2026-11-13T00:00:00.000Z",
            testFiles: [],
          },
        ],
      },
      {
        id: "p-2",
        name: "No Modules",
        createdAt: "2026-11-13T00:00:00.000Z",
        updatedAt: "2026-11-13T00:00:00.000Z",
        modules: [],
      },
      {
        id: "p-3",
        name: "Checkout",
        createdAt: "2026-11-13T00:00:00.000Z",
        updatedAt: "2026-11-13T00:00:00.000Z",
        modules: [
          {
            id: "m-3",
            projectId: "p-3",
            name: "Cart",
            createdAt: "2026-11-13T00:00:00.000Z",
            updatedAt: "2026-11-13T00:00:00.000Z",
            testFiles: [
              {
                id: "tf-3",
                moduleId: "m-3",
                name: "cart.yaml",
                createdAt: "2026-11-13T00:00:00.000Z",
                updatedAt: "2026-11-13T00:00:00.000Z",
                latestRun: null,
              },
              {
                id: "tf-4",
                moduleId: "m-3",
                name: "checkout.yaml",
                createdAt: "2026-11-13T00:00:00.000Z",
                updatedAt: "2026-11-13T00:00:00.000Z",
                latestRun: null,
              },
            ],
          },
        ],
      },
    ],
  };

  it("keeps only projects/modules that contain test files and preserves API order", () => {
    const actual = overviewGroups(tree);

    expect(actual).toEqual([
      {
        id: "p-1",
        name: "Shop",
        createdAt: "2026-11-13T00:00:00.000Z",
        updatedAt: "2026-11-13T00:00:00.000Z",
        modules: [
          {
            id: "m-1",
            projectId: "p-1",
            name: "Auth",
            createdAt: "2026-11-13T00:00:00.000Z",
            updatedAt: "2026-11-13T00:00:00.000Z",
            testFiles: [
              {
                id: "tf-1",
                moduleId: "m-1",
                name: "login.yaml",
                createdAt: "2026-11-13T00:00:00.000Z",
                updatedAt: "2026-11-13T00:00:00.000Z",
                latestRun: null,
              },
            ],
          },
        ],
      },
      {
        id: "p-3",
        name: "Checkout",
        createdAt: "2026-11-13T00:00:00.000Z",
        updatedAt: "2026-11-13T00:00:00.000Z",
        modules: [
          {
            id: "m-3",
            projectId: "p-3",
            name: "Cart",
            createdAt: "2026-11-13T00:00:00.000Z",
            updatedAt: "2026-11-13T00:00:00.000Z",
            testFiles: [
              {
                id: "tf-3",
                moduleId: "m-3",
                name: "cart.yaml",
                createdAt: "2026-11-13T00:00:00.000Z",
                updatedAt: "2026-11-13T00:00:00.000Z",
                latestRun: null,
              },
              {
                id: "tf-4",
                moduleId: "m-3",
                name: "checkout.yaml",
                createdAt: "2026-11-13T00:00:00.000Z",
                updatedAt: "2026-11-13T00:00:00.000Z",
                latestRun: null,
              },
            ],
          },
        ],
      },
    ]);
  });

  it("returns no projects for an empty tree", () => {
    const tree: TreeResponse = {
      items: [],
    };

    expect(overviewGroups(tree)).toEqual([]);
  });

  it("does not mutate the input tree", () => {
    const before = JSON.parse(JSON.stringify(tree));

    void overviewGroups(tree);

    expect(tree).toEqual(before);
  });
});
