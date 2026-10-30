import { describe, expect, it } from "vitest";
import { getDomCandidates, locate, LocateError } from "../../../core/locator/index.js";
import type { JevClient } from "../../../core/locator/types.js";
import { createFixtureBrowserDriver, loadFixturePages } from "../hw3/fixture-driver.js";

describe("Locator integration against hw3 fixtures (no browser)", () => {
  const pages = loadFixturePages();

  it("loads all three demo page fixtures (login, tasks, modal)", () => {
    expect(pages.map((p) => p.name).sort()).toEqual(["login", "modal", "tasks"]);
  });

  for (const page of pages) {
    describe(`page "${page.name}"`, () => {
      for (const item of page.targets) {
        if (item.present && item.elementId !== null && item.bbox !== null) {
          it(`Visual Locate resolves "${item.id}" to elementId ${item.elementId}`, async () => {
            const driver = createFixtureBrowserDriver(page.name);
            const jev: JevClient = {
              bbox: async () => ({ box: item.bbox, confidence: 0.92 }),
              choice: async () => ({ index: null, confidence: 0 }),
            };

            const res = await locate(
              { action: item.action, target: item.target, timeoutMs: 5000 },
              driver,
              jev,
            );
            expect(res.method).toBe("visual");
            expect(res.elementId).toBe(item.elementId);
            expect(res.confidence).toBe(0.92);
          });

          it(`DOM Locate resolves "${item.id}" to elementId ${item.elementId}`, async () => {
            const driver = createFixtureBrowserDriver(page.name);
            const candidates = getDomCandidates(page.snapshot, item.action);
            const expectedCandidateIndex = candidates.findIndex((c) => c.id === item.elementId);
            expect(expectedCandidateIndex).toBeGreaterThanOrEqual(0);

            const jev: JevClient = {
              bbox: async () => ({ box: null, confidence: 0.2 }),
              choice: async () => ({ index: expectedCandidateIndex, confidence: 0.91 }),
            };

            const res = await locate(
              { action: item.action, target: item.target, timeoutMs: 5000 },
              driver,
              jev,
            );
            expect(res.method).toBe("dom");
            expect(res.elementId).toBe(item.elementId);
            expect(res.confidence).toBe(0.91);
          });

          if (item.selector) {
            it(`Selector stage resolves "${item.id}" when selector "${item.selector}" is present`, async () => {
              const driver = createFixtureBrowserDriver(page.name);
              const jev: JevClient = {
                bbox: async () => {
                  throw new Error("Jev should not be called on selector hit");
                },
                choice: async () => {
                  throw new Error("Jev should not be called on selector hit");
                },
              };

              const res = await locate(
                { action: item.action, selector: item.selector, target: item.target, timeoutMs: 5000 },
                driver,
                jev,
              );
              expect(res.method).toBe("selector");
            });
          }
        } else {
          it(`ends in LocateError for unusable or absent target "${item.id}"`, async () => {
            const driver = createFixtureBrowserDriver(page.name);
            const jev: JevClient = {
              bbox: async () => ({
                box: item.present ? item.bbox : null,
                confidence: item.present ? 0.9 : 0.1,
              }),
              choice: async () => ({ index: null, confidence: 0.85 }),
            };

            await expect(
              locate({ action: item.action, target: item.target, timeoutMs: 5000 }, driver, jev),
            ).rejects.toThrow(LocateError);
          });
        }
      }
    });
  }
});
