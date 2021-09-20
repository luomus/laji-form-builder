import { browser } from "protractor";
import { createBuilder, BuilderPO, isDisplayed, FieldSelectorPO } from "./test-utils";

describe("Editor", () => {

	let builder: BuilderPO;
	beforeAll(async () => {
		builder = await createBuilder({id: "JX.519"});
	});

	describe("tabs", () => {

		describe("basic editor", () => {
			it("selected by default", async () => {
				expect(await builder.tabs.$basic.getText()).toBe(await builder.tabs.$active.getText());
			});
			it("field selector displayed", async () => {
				expect(await isDisplayed(builder.$fieldSelectorContainer)).toBe(true);
			});

			it("field editor not displayed when no field selected", async () => {
				expect(await isDisplayed(builder.$fieldEditor)).toBe(false);
			});

			const testFieldDisplaysEditor = async (field: FieldSelectorPO) => {
				await field.$field.click();
				expect(await isDisplayed(builder.$fieldEditor)).toBe(true);
				const fields = await field.getFieldSelectors();
				for (const field of fields) {
					await testFieldDisplaysEditor(field);
				}
			}

			it("field editor displayed for all forms", async () => {
				let $field = builder.$rootFieldSelector;
				await testFieldDisplaysEditor(builder.getFieldSelector($field));
			});
		});
	});

	describe("lang", () => {
		it("fi selected by default", async () => {
			expect(await builder.lang.$fi.getText()).toBe(await builder.lang.$active.getText());
		});
		describe("changing", () => {
			beforeAll(async () => {
				await builder.lang.$sv.click();
			});

			afterAll(async () => {
				await builder.lang.$fi.click();
			});

			it("changes active", async () => {
				expect(await builder.lang.$sv.getText()).toBe(await builder.lang.$active.getText());
			});

			it("changes preview form lang", async () => {
				await browser.sleep(100);
				expect(await builder.formPreview.locate("gatheringEvent.legPublic").$("strong").getText()).toBe("Observatörernas namn är offentliga");
			});
		});
	});
});
