import { test, expect, Locator, Page } from "@playwright/test";
import { getFocusedElement, updateValue } from "@luomus/laji-form/test-export/test-utils";
import { createBuilder, BuilderPO } from "./test-utils";

test.describe.configure({ mode: "serial" });

test.describe("Editor", () => {

	let page: Page;
	let builder: BuilderPO;
	test.beforeAll(async ({browser}) => {
		page = await browser.newPage();
		(await browser.newContext()).route(/https:\/\/apitest.laji.fi\/v0\/named-places*/, route => route.abort());
		builder = await createBuilder(page, "JX.519");
		await builder.waitUntilLoaded();
	});

	test.describe("lang", () => {

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
				await expect(builder.lang.$sv).toHaveClass(/active/);
			});

			test("changes preview form lang", async () => {
				await expect(builder.formPreview.$locate("gatheringEvent.legPublic").locator("strong"))
					.toHaveText("Observatörernas namn är offentliga");
			});

			test("doesn't change editor UI lang", async () => {
				await expect(builder.mainTabs.$options).toHaveText("Ominaisuudet");
			});
		});
	});

	test.describe("tabs", () => {

		test.describe("fields", () => {

			let $rootField: Locator;
			let fieldSelector: ReturnType<BuilderPO["getFieldSelector"]>;

			test.beforeAll(async () => {
				$rootField = builder.$rootFieldSelector;
				fieldSelector = builder.getFieldSelector($rootField);
			});

			test("selected by default", async () => {
				await expect(builder.mainTabs.$fields).toHaveClass(/active/);
			});

			test("displays fields", async () => {
				await expect($rootField).toBeVisible();
				expect((await fieldSelector.getFieldSelectors()).length).toBeGreaterThan(0);
			});

			test("expands fields when clicking field with children", async () => {
				const gatheringsField = (await fieldSelector.getFieldSelectors())[2];
				expect((await gatheringsField.getFieldSelectors()).length).toBe(0);
				await gatheringsField.$field.click();
				expect((await gatheringsField.getFieldSelectors()).length).toBeGreaterThan(0);
			});
		});

		test.describe("basic editor", () => {
			test("selected by default", async () => {
				await expect(builder.fieldTabs.$basic).toHaveClass(/active/);
			});

			test("field selector displayed", async () => {
				await expect(builder.$fieldSelectorContainer).toBeVisible();
			});

			test("field editor not displayed when no field selected", async () => {
				await expect(builder.$fieldEditor).not.toBeVisible();
			});

			test("adding excludeFromCopy to field with already existing options", async () => {
				const field = builder.getFieldSelectorByJSONPath("/document/secureLevel");
				await field.$field.click();

				const $excludeFromCopy = builder.editorForm.getBooleanWidget("options.excludeFromCopy");
				await $excludeFromCopy.$false.click();

				await expect(builder.$toolbarSpinner).toBeHidden(); // Wait for form transformation.
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
		});

		test.describe("UI editor", () => {

			test.beforeAll(async () => {
				await builder.activateFieldByPointer( "gatheringEvent.dateBegin");
				await builder.fieldTabs.$ui.click();
			});

			test("selected when clicked", async () => {
				await expect(builder.fieldTabs.$ui).toHaveClass(/active/);
			});

			test("field selector displayed", async () => {
				await expect(builder.$fieldSelectorContainer).toBeVisible();
			});

			test.describe("ui:title", () => {
				let $renderedUiTitle: Locator;
				let origFi: string;
				let origSv: string;
				let origEn: string;
				let $uiTitle: Locator;

				test.beforeAll(async () => {
					 $renderedUiTitle = builder.formPreview.$locate("gatheringEvent.dateBegin").locator("label");
					$uiTitle = page.getByLabel("ui:title");

					origFi = await $renderedUiTitle.textContent() as string;
					await builder.lang.changeTo("sv");
					await expect(builder.$toolbarSpinner).not.toBeVisible();
					origSv = await $renderedUiTitle.textContent() as string;
					await builder.lang.changeTo("en");
					await expect(builder.$toolbarSpinner).not.toBeVisible();
					origEn = await $renderedUiTitle.textContent() as string;
					await builder.lang.changeTo("fi");
					await expect(builder.$toolbarSpinner).not.toBeVisible();
				});

				test("when empty adding when empty adds with all langs", async () => {
					await updateValue($uiTitle, "foo");

					await expect($renderedUiTitle).toHaveText("foo");
					await builder.lang.$sv.click();
					await expect($renderedUiTitle).toHaveText("foo");
					await builder.lang.$en.click();
					await expect($renderedUiTitle).toHaveText("foo");

					await builder.lang.$fi.click();
				});

				test.describe("when not empty", () => {

					let shouldAccept = false;
					let dialogMsg: string;

					test.beforeAll(async () => {
						page.on("dialog", dialog => {
							dialogMsg = dialog.message();
							shouldAccept ? dialog.accept() : dialog.dismiss();
						});
					});

					// eslint-disable-next-line max-len
					test("if value same for all, editing asks if the edition should be done for all langs", async () => {
						shouldAccept = true;
						await updateValue($uiTitle, "foobar");
						expect(dialogMsg).not.toBeFalsy();
						dialogMsg = "";
					});

					test("accepting updates only for selected lang", async () => {
						await expect($renderedUiTitle).toHaveText("foobar");
						await builder.lang.changeTo("sv");
						await expect($renderedUiTitle).toHaveText("foobar");
						await builder.lang.changeTo("en");
						await expect($renderedUiTitle).toHaveText("foobar");
						await builder.lang.changeTo("fi");
					});

					test("editing asks if the edition should be done for all langs after all-lang update", async () => {
						shouldAccept = false;
						await updateValue($uiTitle, "foobarbar");

						expect(dialogMsg).not.toBeFalsy();
					});

					test("dismissing updates only for selected lang", async () => {
						await expect($renderedUiTitle).toHaveText("foobarbar");
						await builder.lang.changeTo("sv");
						await expect($renderedUiTitle).toHaveText("foobar");
						await builder.lang.changeTo("en");
						await expect($renderedUiTitle).toHaveText("foobar");

						await builder.lang.changeTo("fi");
					});

					// eslint-disable-next-line max-len
					test("clearing value clears for all langs without confirming and restores original label", async () => {
						await updateValue($uiTitle, "");
						await expect($renderedUiTitle).toHaveText(origFi);
						await expect($uiTitle).toHaveValue("");
						await builder.lang.changeTo("sv");
						await expect($renderedUiTitle).toHaveText(origSv);
						await expect($uiTitle).toHaveValue("");
						await builder.lang.changeTo("en");
						await expect($renderedUiTitle).toHaveText(origEn);
						await expect($uiTitle).toHaveValue("");

						await builder.lang.changeTo("fi");
					});
				});
			});
		});

		test.describe("Options editor", () => {
			test("selected when clicked", async () => {
				await builder.mainTabs.$options.click();
				await expect(builder.mainTabs.$options).toHaveClass(/active/);
			});

			test("shows JSON tab by default", async () => {
				await expect(builder.optionsEditor.tabs.$JSON)
					.toHaveClass(/active/);
			});

			test.describe("selecting UI editor", () => {

				test.beforeAll(async () => {
					await builder.optionsEditor.tabs.$UI.click();
				});

				test("shows form after loaded", async () => {
					await expect(builder.$toolbarSpinner).toBeHidden(); // Wait for form transformation.
					await expect(builder.optionsEditor.$form).toBeVisible();
				});

				test("when empty adding adds with all langs", async () => {
					const $emptyStringField = builder.editorForm.$locate("logo").locator("input");
					await updateValue($emptyStringField, "foo");

					await builder.saveModal.open();
					await expect(builder.$toolbarSpinner).toBeHidden(); // Wait for form transformation.
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

	test.describe("picker", () => {
		test("activates on click", async () => {
			await builder.picker.$button.click();
			await expect(builder.picker.$button).toHaveClass(/active/);
		});

		test("displays highlighter", async () => {
			await builder.formPreview.$locate("secureLevel").hover();

			await expect(builder.picker.$highlighter).toBeVisible();
		});

		test("inactives on elem click", async () => {
			await builder.picker.$highlighter.click();
			await builder.picker.$button.click();
		});

		test("clears highlighter on elem click", async () => {
			await expect(builder.picker.$highlighter).not.toBeVisible();
		});

		test("selects clicked field on editor", async () => {
			await expect(builder.$activeField.$label).toHaveText("secureLevel");
		});

		test("inactivates on esc", async () => {
			await builder.picker.$button.click();
			await getFocusedElement(page).press("Escape");
			await expect(builder.picker.$button).not.toHaveClass(/active/);
		});
	});
});
