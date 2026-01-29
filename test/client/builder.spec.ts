import { test, expect, Page } from "@playwright/test";
import { BuilderPO, createBuilder } from "./test-utils";

let formJSON = JSON.stringify(require("./test-form.json"));

test.describe.configure({ mode: "serial" });

test.describe("Builder", () => {
	let page: Page;
	let builder: BuilderPO;

	test.beforeAll(async ({browser}) => {
		page = await browser.newPage();
		builder = await createBuilder(page);
		await builder.create.$createButton.click();
	});

	test.describe("JSON", () => {

		test("option is displayed",  async () => {
			await expect(builder.create.$jsonButton).toBeVisible();
		});

		test("can be selected",  async () => {
			await builder.create.$jsonButton.click();
			await expect(builder.create.json.$input).toBeVisible();
		});

		test("builds form", async () => {
			await builder.create.json.$input.fill(formJSON);
			await builder.create.json.$submit.click();
			await expect(builder.formPreview.$form).toBeVisible();
		});
	});

	test.describe("databank option", () => {

		test.beforeAll(async ({browser}) => {
			builder = await createBuilder(await browser.newPage());
			await builder.create.$createButton.click();
		});

		test("option is displayed", async () => {
			await expect(builder.create.$DatabankButton).toBeVisible();
		});
	});

	test.describe("lang", () => {

		test.beforeAll(async ({browser}) => {
			builder = await createBuilder(await browser.newPage());
			await builder.create.$createButton.click();
			await builder.create.$jsonButton.click();
			await builder.create.json.$input.fill(formJSON);
			await builder.create.json.$submit.click();
		});

		test("fi selected by default", async () => {
			await expect(builder.lang.$fi).toHaveClass(/active/);
		});

		test.describe("changing", () => {
			test.beforeAll(async () => {
				await builder.lang.changeTo("sv");
			});

			test.afterAll(async () => {
				await builder.lang.changeTo("fi");
			});

			test("changes active", async () => {
				await expect(builder.lang.$sv).toHaveText(await builder.lang.$active.textContent() as string);
			});

			test("changes preview form lang", async () => {
				await expect(builder.formPreview.$locate("gatheringEvent.legPublic")
					.locator("label[for='root_gatheringEvent_legPublic']"))
					.toHaveText("Observatörernas namn är offentliga");
			});

			test("doesn't change editor UI lang", async () => {
				await expect(builder.mainTabs.$options).toHaveText("Ominaisuudet");
			});
		});
	});
});
