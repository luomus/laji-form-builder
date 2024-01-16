import { test, expect, Locator, Page } from "@playwright/test";
import { createBuilder, BuilderPO } from "./test-utils";

test.describe.configure({ mode: "serial" });

test.describe("Hierarchy", () => {
	let page: Page;
	let builder: BuilderPO;

	test.beforeAll(async ({browser}) => {
		page = await browser.newPage();
		(await browser.newContext()).route(/https:\/\/apitest.laji.fi\/v0\/named-places*/, route => route.abort());
		builder = await createBuilder(page, "MHL.932");
		await builder.waitUntilLoaded();
	});

	test("button shown", async () => {
		await expect(builder.hierarchy.$button).toBeVisible();
	});

	test("clicking button shows modal", async () => {
		await builder.hierarchy.$button.click();
		await expect(builder.hierarchy.modal.$container).toBeVisible();
	});

	test("modal shows related forms", async () => {
		await expect(builder.hierarchy.modal.$container).toContainText("MHL.117");
		await expect(builder.hierarchy.modal.$container).toContainText("MHL.932");
		await expect(builder.hierarchy.modal.$container).toContainText("MHL.1042");
		await expect(builder.hierarchy.modal.$container).toContainText("MHL.1040");
	});

	test("modal can be closed", async () => {
		await builder.hierarchy.modal.$close.click();
		await expect(builder.hierarchy.modal.$container).toBeHidden();
	});
});
