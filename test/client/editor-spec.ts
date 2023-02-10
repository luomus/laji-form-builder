import { updateValue } from "laji-form/test-export/test-utils";
import { $, browser, protractor } from "protractor";
import { createBuilder, BuilderPO, isDisplayed, ElementFinder, FieldSelectorPO } from "./test-utils";

describe("Editor", () => {

	let builder: BuilderPO;
	beforeAll(async () => {
		builder = await createBuilder({id: "JX.519"});
	});

	describe("lang", () => {
		it("fi selected by default", async () => {
			expect(await builder.lang.$fi.getText()).toBe(await builder.lang.$active.getText());
		});

		describe("changing", () => {
			beforeAll(async () => {
				await builder.lang.changeTo("sv");
			});

			afterAll(async () => {
				await builder.lang.changeTo("fi");
			});

			it("changes active", async () => {
				expect(await builder.lang.$sv.getText()).toBe(await builder.lang.$active.getText());
			});

			it("changes preview form lang", async () => {
				expect(await builder.formPreview.locate("gatheringEvent.legPublic").$("strong").getText())
					.toBe("Observatörernas namn är offentliga");
			});

			it("doesn't change editor UI lang", async () => {
				expect(await builder.mainTabs.$options.getText()).toBe("Ominaisuudet");
			});
		});
	});

	describe("tabs", () => {

		describe("fields", () => {

			let $rootField: ElementFinder;
			let fieldSelector: FieldSelectorPO;

			beforeAll(async () => {
				$rootField = builder.$rootFieldSelector;
				fieldSelector = builder.getFieldSelector($rootField);
			});

			it("selected by default", async () => {
				expect(await builder.mainTabs.$fields.getText()).toBe(await builder.mainTabs.$active.getText());
			});

			it("displays fields", async () => {
				expect(await isDisplayed($rootField)).toBe(true);
				expect((await fieldSelector.getFieldSelectors()).length).toBeGreaterThan(0);
			});

			it("expands fields when clicking field with children", async () => {
				const gatheringsField = (await fieldSelector.getFieldSelectors())[2];
				expect((await gatheringsField.getFieldSelectors()).length).toBe(0);
				await gatheringsField.$field.click();
				expect((await gatheringsField.getFieldSelectors()).length).toBeGreaterThan(0);
			});
		});

		describe("basic editor", () => {
			it("selected by default", async () => {
				expect(await builder.fieldTabs.$basic.getText()).toBe(await builder.fieldTabs.$active.getText());
			});

			it("field selector displayed", async () => {
				expect(await isDisplayed(builder.$fieldSelectorContainer)).toBe(true);
			});

			it("field editor not displayed when no field selected", async () => {
				expect(await isDisplayed(builder.$fieldEditor)).toBe(false);
			});

			it("adding excludeFromCopy to field with already existing options", async () => {
				const field = builder.getFieldSelectorByJSONPath("/document/secureLevel");
				await field.$field.click();

				const $excludeFromCopy = (await builder.getEditorForm())
					.getBooleanWidget("options.excludeFromCopy");
				await $excludeFromCopy.$false.click();

				await builder.waitUntilLoaded();
				await builder.saveModal.open();

				expect(await builder.saveModal.getDiff()).toEqual([
					{kind: "new", rhs: false, path: "/fields/1/options/excludeFromCopy"}
				]);

				await builder.saveModal.close();
				await $excludeFromCopy.$undefined.click(); // Bring back initial value.
				await builder.saveModal.open();

				expect(await builder.saveModal.getDiff()).toEqual([]);

				await builder.saveModal.close();
			});

			// it("field editor displayed for all fields", async () => {
			// 	let $field = builder.$rootFieldSelector;
			// 	debugger;
			// 	await testFieldDisplaysEditor(builder.getFieldSelector($field), "");
			// });

		});

		describe("UI editor", () => {
			it("selected when clicked", async () => {
				await builder.fieldTabs.$ui.click();
				expect(await builder.fieldTabs.$ui.getText()).toBe(await builder.fieldTabs.$active.getText());
			});

			it("field selector displayed", async () => {
				expect(await isDisplayed(builder.$fieldSelectorContainer)).toBe(true);
			});

			// it("field editor displayed for all fields", async () => {
			// 	let $field = builder.$rootFieldSelector;
			// 	await testFieldDisplaysEditor(builder.getFieldSelector($field), "");
			// });

			describe("ui:title", () => {
				const fieldName = "gatheringEvent.dateBegin";
				const getRenderedUiTitle = () => builder.formPreview.locate(fieldName).$("label").getText();
				let origFi: string;
				let origSv: string;
				let origEn: string;
				let $uiTitle: ElementFinder;

				beforeAll(async () => {
					await builder.activateFieldByPointer(fieldName);
					$uiTitle = (await builder.editorLocate("$ui:title")).$("input");

					origFi = await getRenderedUiTitle();
					await builder.lang.changeTo("sv");
					origSv = await getRenderedUiTitle();
					await builder.lang.changeTo("en");
					origEn = await getRenderedUiTitle();
					await builder.lang.changeTo("fi");
				});

				it("when empty adding when empty adds with all langs", async () => {
					await updateValue($uiTitle, "foo");
					await builder.waitUntilLoaded();

					expect(await getRenderedUiTitle()).toBe("foo");
					await builder.lang.$sv.click();
					expect(await getRenderedUiTitle()).toBe("foo");
					await builder.lang.$en.click();
					expect(await getRenderedUiTitle()).toBe("foo");

					await builder.lang.$fi.click();
				});

				describe("when not empty", () => {

					it("if value same for all, editing asks if the edition should be done for all langs", async () => {
						await updateValue($uiTitle, "foobar");
						expect(await browser.switchTo().alert().getText()).not.toBeFalsy();
					});

					it("accepting updates only for selected lang", async () => {
						await browser.switchTo().alert().accept();
						await builder.waitUntilLoaded();

						expect(await getRenderedUiTitle()).toBe("foobar");

						await builder.lang.changeTo("sv");

						expect(await getRenderedUiTitle()).toBe("foobar");

						await builder.lang.changeTo("en");

						expect(await getRenderedUiTitle()).toBe("foobar");

						await builder.lang.changeTo("fi");
					});

					it("editing asks if the edition should be done for all langs after all-lang update", async () => {
						await updateValue($uiTitle, "foobarbar");

						expect(await browser.switchTo().alert().getText()).not.toBeFalsy();
					});

					it("dismissing updates only for selected lang", async () => {
						await browser.switchTo().alert().dismiss();
						await builder.waitUntilLoaded();

						expect(await getRenderedUiTitle()).toBe("foobarbar");
						await builder.lang.changeTo("sv");
						expect(await getRenderedUiTitle()).toBe("foobar");
						await builder.lang.changeTo("en");
						expect(await getRenderedUiTitle()).toBe("foobar");

						await builder.lang.changeTo("fi");
					});

					// eslint-disable-next-line max-len
					it("clearing value clears for all langs without confirming and restores original label", async () => {
						await updateValue($uiTitle, "");
						await builder.waitUntilLoaded();
						expect(await getRenderedUiTitle()).toBe(origFi);
						expect(await $uiTitle.getAttribute("value")).toBe("");
						await builder.lang.changeTo("sv");
						expect(await getRenderedUiTitle()).toBe(origSv);
						expect(await $uiTitle.getAttribute("value")).toBe("");
						await builder.lang.changeTo("en");
						expect(await getRenderedUiTitle()).toBe(origEn);
						expect(await $uiTitle.getAttribute("value")).toBe("");

						await builder.lang.changeTo("fi");
					});
				});
			});
		});

		describe("Options editor", () => {
			it("selected when clicked", async () => {
				await builder.mainTabs.$options.click();
				expect(await builder.mainTabs.$options.getText()).toBe(await builder.mainTabs.$active.getText());
			});

			it("shows JSON tab by default", async () => {
				expect(await builder.optionsEditor.tabs.$JSON.getText())
					.toBe(await builder.optionsEditor.tabs.$active.getText());
			});

			describe("selecting UI editor", () => {

				beforeAll(async () => {
					await builder.optionsEditor.tabs.$UI.click();
				});

				it("shows form after loaded", async () => {
					await builder.optionsEditor.waitUntilLoaded();
					expect(await isDisplayed(builder.optionsEditor.$form)).toBe(true);
				});

				it("when empty adding when empty adds with all langs", async () => {
					const $emptyStringField = (await builder.editorLocate("logo")).$("input");
					await updateValue($emptyStringField, "foo");

					await builder.waitUntilLoaded();

					await builder.saveModal.open();
					const diff = await builder.saveModal.getDiff();

					expect(diff).toEqual([
						{kind: "new", rhs: "foo", path: "/logo"}
					]);

					await builder.saveModal.close();
					await builder.lang.changeTo("fi");
				});
			});
		});
	});

	describe("picker", () => {
		it("activates on click", async () => {
			await builder.picker.$button.click();
			expect(await builder.picker.isButtonActive()).toBe(true);
		});

		it("displays highlighter", async () => {
			await browser.actions()
			  .mouseMove(builder.formPreview.locate("secureLevel").getWebElement())
			  .perform();

			expect(await isDisplayed(builder.picker.$highlighter)).toBe(true);
		});

		it("inactives on elem click", async () => {
			await builder.picker.$highlighter.click();
			await builder.picker.$button.click();
		});

		it("clears highlighter on elem click", async () => {
			expect(await isDisplayed(builder.picker.$highlighter)).toBe(false);
		});

		it("selects clicked field on editor", async () => {
			expect(await builder.getActiveField().getLabel()).toBe("secureLevel");
		});

		it("inactivates on esc", async () => {
			await builder.picker.$button.click();
			$("body").sendKeys(protractor.Key.ESCAPE);
			expect(await builder.picker.isButtonActive()).toBe(false);
		});
	});

});
