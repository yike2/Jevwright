import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { fixturePath, loadFixtureDriver } from "./support/fixture-driver.ts";

describe("Fixture Browser Driver", () => {
  it("serves the page's fixture screenshot with its pixel size", async () => {
    const driver = await loadFixtureDriver("login");

    const shot = await driver.screenshot();

    expect(Buffer.from(shot.png).equals(await readFile(fixturePath("login", "screenshot.png")))).toBe(true);
    expect(shot.width).toBe(1280);
    expect(shot.height).toBe(800);
  });

  it("lists the page's interactive elements from the snapshot", async () => {
    const driver = await loadFixtureDriver("login");

    const elements = await driver.interactiveElements();

    expect(elements).toHaveLength(10);
    expect(elements[6]).toMatchObject({
      id: "e6",
      tag: "button",
      role: "button",
      name: "Sign in",
      bbox: { x: 256, y: 420, width: 89, height: 42 },
      obscured: false,
    });
  });

  it("answers CSS selectors against the saved DOM with every matching element", async () => {
    const driver = await loadFixtureDriver("list");

    expect((await driver.query("tr[data-user=bob] button.danger")).map((e) => e.id)).toEqual(["e8"]);
    expect((await driver.query("button.danger")).map((e) => e.id)).toEqual(["e6", "e8", "e10", "e12"]);
    expect(await driver.query("#no-such-element")).toEqual([]);
  });

  it("hit-tests a viewport point, skipping elements covered by a modal", async () => {
    const driver = await loadFixtureDriver("modal");

    expect((await driver.elementAt(794, 501))?.id).toBe("e7"); // dialog's Delete
    expect(await driver.elementAt(329, 313)).toBeNull(); // Save changes, behind the backdrop
    expect(await driver.elementAt(100, 700)).toBeNull(); // empty backdrop
  });
});
