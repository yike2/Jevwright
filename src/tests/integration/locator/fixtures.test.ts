import { describe, it, expect } from "vitest";
import { getUsableCandidates } from "../../../core/locator/dom.js";
import { locate, LocateError, type JevClient } from "../../../core/locator/index.js";
import { loadPageFixtures } from "./fixture-driver.js";

describe("Locator integration against hw3 fixtures (no browser)", () => {
  it("resolves every ground-truth target via Selector, Visual Locate, and DOM Locate, and throws LocateError for absent targets", async () => {
    const fixtures = await loadPageFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(3);

    for (const fx of fixtures) {
      for (const item of fx.groundTruth.targets) {
        if (item.present && item.elementId !== null && item.bbox !== null) {
          // 1. Selector locate when selector is provided
          if (item.selector) {
            const noOpJev: JevClient = {
              bbox: async () => ({ box: null, confidence: 0 }),
              choice: async () => ({ index: null, confidence: 0 }),
            };
            const selRes = await locate(
              {
                action: item.action,
                selector: item.selector,
                target: item.target,
                timeoutMs: 5000,
              },
              fx.driver,
              noOpJev,
            );
            expect(selRes.method).toBe("selector");
          }

          // 2. Visual Locate with ground-truth bbox
          const visualJev: JevClient = {
            bbox: async () => ({ box: item.bbox, confidence: 0.95 }),
            choice: async () => ({ index: null, confidence: 0 }),
          };
          const visRes = await locate(
            {
              action: item.action,
              target: item.target,
              timeoutMs: 5000,
            },
            fx.driver,
            visualJev,
          );
          expect(visRes.method).toBe("visual");
          expect(visRes.elementId).toBe(item.elementId);

          // 3. DOM Locate choosing the ground-truth element
          const usable = getUsableCandidates(fx.snapshot.elements, item.action);
          const candidateIndex = usable.findIndex((el) => el.id === item.elementId);
          expect(candidateIndex).toBeGreaterThanOrEqual(0);

          const domJev: JevClient = {
            bbox: async () => ({ box: null, confidence: 0.1 }),
            choice: async () => ({ index: candidateIndex, confidence: 0.92 }),
          };
          const domRes = await locate(
            {
              action: item.action,
              target: item.target,
              timeoutMs: 5000,
            },
            fx.driver,
            domJev,
          );
          expect(domRes.method).toBe("dom");
          expect(domRes.elementId).toBe(item.elementId);
        } else {
          // Target with present: false or elementId: null ends in LocateError
          const absentJev: JevClient = {
            bbox: async () => ({ box: null, confidence: 0.1 }),
            choice: async () => ({ index: null, confidence: 0.9 }),
          };
          await expect(
            locate(
              {
                action: item.action,
                target: item.target,
                timeoutMs: 5000,
              },
              fx.driver,
              absentJev,
            ),
          ).rejects.toBeInstanceOf(LocateError);
        }
      }
    }
  });
});

