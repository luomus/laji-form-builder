import { $, browser } from "protractor";
import { createBuilder, BuilderPO, isDisplayed, FieldSelectorPO } from "./test-utils";

describe("Editor", () => {

	let builder: BuilderPO;
	beforeAll(async () => {
		builder = await createBuilder({id: "JX.519"});
	});

	describe("tabs", () => {

		const testFieldDisplaysEditor = async (field: FieldSelectorPO, parentPath: string) => {
			const path = `${parentPath}/${await field.label}`;
			const fields = await field.getFieldSelectors();
			// idk why, but protractor throws errors without this.
			await builder.$fieldEditor.isPresent();
			await field.$field.click();
			expect(await isDisplayed(builder.$fieldEditor)).toBe(true, `Editor didn't display when selected ${path}`);
			for (const field of fields) {
				await testFieldDisplaysEditor(field, path);
			}
		};

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

			it("field editor displayed for all forms", async () => {
				let $field = builder.$rootFieldSelector;
				await testFieldDisplaysEditor(builder.getFieldSelector($field), "");
			});
		});

		describe("UI editor", () => {
			it("selected when clicked", async () => {
				await builder.tabs.$ui.click();
				expect(await builder.tabs.$ui.getText()).toBe(await builder.tabs.$active.getText());
			});

			it("field selector displayed", async () => {
				expect(await isDisplayed(builder.$fieldSelectorContainer)).toBe(true);
			});

			it("field editor displayed for all forms", async () => {
				let $field = builder.$rootFieldSelector;
				await testFieldDisplaysEditor(builder.getFieldSelector($field), "");
			});
		});


		describe("Options editor", () => {
			it("selected when clicked", async () => {
				await builder.tabs.$options.click();
				expect(await builder.tabs.$options.getText()).toBe(await builder.tabs.$active.getText());
			});

			it("shows spinner", async () => {
				expect(await isDisplayed(builder.optionsEditor.$spinner)).toBe(true);
			});

			it("shows form after loaded", async () => {
				await builder.optionsEditor.waitUntilLoaded();
				expect(await isDisplayed(builder.optionsEditor.$form)).toBe(true);
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
