// What the page does with a pointer and a keyboard (SReq 11): `npm run test:ui`. It drives the page in a browser
// through Playwright, a development dependency (`npm install --save-dev playwright`), with the installed Chrome or
// Playwright's own Chromium. Without either it skips. The engine's side is checked by tests/studio.test.js.
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

let playwright = null;
try { playwright = require("playwright"); } catch (e) { /* not installed: every check skips */ }

const PAGE = "file://" + path.join(__dirname, "..", "..", "index.html");
let browser = null;
let page = null;
let why = playwright ? "" : "Playwright is not installed: npm install --save-dev playwright";
const errors = [];

before(async () => {
  if (!playwright) return;
  for (const options of [{ channel: "chrome" }, {}]) {
    try { browser = await playwright.chromium.launch(Object.assign({ headless: true }, options)); break; } catch (e) { why = `No browser to run: ${e.message.split("\n")[0]}`; }
  }
  if (!browser) return;
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("dialog", (d) => d.accept());
  page.on("pageerror", (e) => errors.push(String(e)));
});
after(async () => { if (browser) await browser.close(); });

/** The page with the ArchiMate 4.0 template, nothing kept from before. */
async function fresh(t) {
  if (!page) { t.skip(why); return false; }
  await page.goto(PAGE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click("#btnNew");
  await page.locator("#menuNew .menu-item", { hasText: /^ArchiMate 4\.0/ }).click();
  return true;
}

const go = (tab, id) => page.evaluate(([t, i]) => window.__studio.go(t, i), [tab, id]);
const project = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__studio.project)));
const row = (scope, key) => page.locator(`[data-scope="${scope}"] [data-key="${key}"]`);

/** Drag with the mouse from one element to another: its middle, or its top or bottom edge. Alt held if asked. */
async function drag(from, to, opts = {}) {
  await from.scrollIntoViewIfNeeded();
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  const sx = a.x + a.width / 2;
  const sy = a.y + a.height / 2;
  const ty = b.y + (opts.at === "before" ? 3 : opts.at === "after" ? b.height - 3 : b.height / 2);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 8, sy + 8, { steps: 2 });
  if (opts.alt) await page.keyboard.down("Alt");
  await page.mouse.move(b.x + b.width / 2, ty, { steps: 8 });
  await page.mouse.up();
  if (opts.alt) await page.keyboard.up("Alt");
}

test("a type with two parents has a row under each (SReq 11.1)", async (t) => {
  if (!(await fresh(t))) return;
  await go("elements", "ApplicationComponent");
  assert.equal(await row("elements", "arch:Element/ApplicationDomainElement/ApplicationComponent").count(), 1);
  assert.equal(await row("elements", "arch:Element/StructureElement/ActiveStructureElement/InternalActiveStructureElement/ApplicationComponent").count(), 1);
  // Its other place is highlighted.
  assert.equal(await page.locator('[data-scope="elements"] .tv-row.also[data-id="ApplicationComponent"]').count(), 1);
  // Subtypes are kinds of their parent in the relationship tree as well.
  await go("relationships", "ReadAccess");
  assert.equal(await row("relationships", "arch:QualifiedRelationship/Access/ReadAccess").count(), 1);
});

test("dragging a type onto another moves it there, offers the matching category, and undoes (SReq 11.2, 11.6)", async (t) => {
  if (!(await fresh(t))) return;
  await go("elements", "BusinessActor");
  await drag(row("elements", "arch:Element/BusinessDomainElement/BusinessActor"), row("elements", "arch:Element/ApplicationDomainElement"));
  let p = await project();
  assert.deepEqual(p.elements.find((e) => e.id === "BusinessActor").parents, ["InternalActiveStructureElement", "ApplicationDomainElement"]);
  await page.locator("#toast button", { hasText: "Classify Business Actor in Application Domain" }).click();
  p = await project();
  assert.ok(p.elements.find((e) => e.id === "BusinessActor").categories.includes("ApplicationDomain"));
  await page.click("#btnUndo");
  await page.click("#btnUndo");
  p = await project();
  assert.deepEqual(p.elements.find((e) => e.id === "BusinessActor").parents, ["InternalActiveStructureElement", "BusinessDomainElement"]);
});

test("with Alt a drop adds a parent; a drop under one's own subtype changes nothing (SReq 11.2)", async (t) => {
  if (!(await fresh(t))) return;
  await go("elements", "Product");
  await drag(row("elements", "arch:Element/BusinessDomainElement/Product"), row("elements", "arch:Element/ApplicationDomainElement"), { alt: true });
  let p = await project();
  assert.ok(p.elements.find((e) => e.id === "Product").parents.includes("ApplicationDomainElement"));
  assert.ok(p.elements.find((e) => e.id === "Product").parents.includes("BusinessDomainElement"));
  await go("elements", "BehaviorElement");
  const before = JSON.stringify((await project()).elements);
  await drag(row("elements", "arch:Element/BehaviorElement"), row("elements", "arch:Element/BehaviorElement/InternalBehaviorElement"));
  assert.equal(JSON.stringify((await project()).elements), before);
});

test("rows chosen together with Shift-click move together (SReq 11.3)", async (t) => {
  if (!(await fresh(t))) return;
  await go("elements", "BusinessInterface");
  await row("elements", "arch:Element/BusinessDomainElement/BusinessInterface").click();
  await row("elements", "arch:Element/BusinessDomainElement/BusinessObject").click({ modifiers: ["Shift"] });
  assert.equal(await page.locator('[data-scope="elements"] .tv-row.picked').count(), 2);
  await drag(row("elements", "arch:Element/BusinessDomainElement/BusinessInterface"), row("elements", "arch:Element/ApplicationDomainElement"));
  const p = await project();
  for (const id of ["BusinessInterface", "BusinessObject"]) {
    const parents = p.elements.find((e) => e.id === id).parents;
    assert.ok(parents.includes("ApplicationDomainElement") && !parents.includes("BusinessDomainElement"), id);
  }
});

test("Alt+Left takes a type out to its parent's parent and keeps the focus on it (SReq 11.3)", async (t) => {
  if (!(await fresh(t))) return;
  await go("elements", "DataObject");
  await row("elements", "arch:Element/ApplicationDomainElement/DataObject").focus();
  await page.keyboard.press("Alt+ArrowLeft");
  const p = await project();
  assert.deepEqual(p.elements.find((e) => e.id === "DataObject").parents, ["PassiveStructureElement"]);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), "DataObject");
});

test("a row's menu classifies a type in a category picked from a list (SReq 11.3)", async (t) => {
  if (!(await fresh(t))) return;
  await go("elements", "Process");
  const r = row("elements", "arch:Element/BehaviorElement/InternalBehaviorElement/Process");
  await r.scrollIntoViewIfNeeded();
  await r.click({ button: "right" });
  await page.locator(".ctx-menu .menu-item", { hasText: "Classify in…" }).click();
  await page.keyboard.type("Motivation Domain");
  await page.keyboard.press("Enter");
  assert.ok((await project()).elements.find((e) => e.id === "Process").categories.includes("MotivationDomain"));
});

test("on the taxonomy, a member moves by drag and reorders by Alt+Down, and the order is written (SReq 11.3, 11.7)", async (t) => {
  if (!(await fresh(t))) return;
  await go("taxonomy", "BusinessDomain");
  await drag(row("taxonomy", "scheme/Domain/BusinessDomain/m:Product"), row("taxonomy", "scheme/Domain/ApplicationDomain"));
  let p = await project();
  const product = p.elements.find((e) => e.id === "Product");
  assert.ok(product.categories.includes("ApplicationDomain") && !product.categories.includes("BusinessDomain"));
  await row("taxonomy", "scheme/Domain/BusinessDomain/m:BusinessActor").focus();
  await page.keyboard.press("Alt+ArrowDown");
  p = await project();
  assert.deepEqual(p.taxonomy.categories.find((c) => c.id === "BusinessDomain").memberOrder, ["BusinessInterface", "BusinessActor", "BusinessObject"]);
  const tax = await page.evaluate(() => window.LAStudio.generator.generate(window.__studio.project).find((f) => f.kind === "taxonomy").content);
  assert.match(tax, /am4tax:BusinessDomainOrder/);
});

test("in the grid, dragging a type to another cell regroups it (SReq 11.5)", async (t) => {
  if (!(await fresh(t))) return;
  await go("taxonomy");
  await page.locator(".seg button", { hasText: "Grid" }).click();
  const chip = page.locator(".tax-grid .gchip", { hasText: "Business Actor" });
  const target = page.locator(".tax-grid tbody tr", { hasText: "Behavior" }).locator("td").nth(1);
  await drag(chip, target);
  const actor = (await project()).elements.find((e) => e.id === "BusinessActor");
  assert.deepEqual(actor.categories.sort(), ["BehaviorAspect", "BusinessDomain"]);
});

test("a proposal order's types reorder by drag (SReq 11.7)", async (t) => {
  if (!(await fresh(t))) return;
  await go("taxonomy");
  const first = (await project()).proposalOrders[0];
  const list = page.locator(`[data-scope="order-${first.id}"]`);
  await list.scrollIntoViewIfNeeded();
  await drag(list.locator(`[data-key="${first.members[1]}"]`), list.locator(`[data-key="${first.members[0]}"]`), { at: "before" });
  const now = (await project()).proposalOrders[0].members;
  assert.deepEqual(now.slice(0, 2), [first.members[1], first.members[0]]);
});

test("a viewpoint moves to another catalog category by drag (SReq 11.3)", async (t) => {
  if (!(await fresh(t))) return;
  // Two categories near the top of the catalog, so that both rows are in view.
  const p0 = await project();
  const composition = p0.viewpointCategories.find((c) => c.label === "Composition");
  const cooperation = p0.viewpointCategories.find((c) => c.label === "Cooperation");
  const v = p0.viewpoints.find((x) => x.categories.includes(composition.id) && !x.categories.includes(cooperation.id));
  await go("viewpoints", v.id);
  await drag(page.locator(`[data-scope="viewpoints"] .tv-row[data-id="${v.id}"]`).first(), page.locator(`[data-scope="viewpoints"] .tv-row[data-id="${cooperation.id}"]`));
  const after = (await project()).viewpoints.find((x) => x.id === v.id);
  assert.ok(after.categories.includes(cooperation.id) && !after.categories.includes(composition.id));
});

test("no page error on any page", async (t) => {
  if (!(await fresh(t))) return;
  for (const tab of ["overview", "elements", "relationships", "attributes", "rules", "taxonomy", "viewpoints", "stakeholders", "notation", "output", "issues"]) await go(tab);
  assert.deepEqual(errors, []);
});
