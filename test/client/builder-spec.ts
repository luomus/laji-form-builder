import { BuilderPO, createBuilder, isDisplayed } from "./test-utils";
import { browser, $ } from "protractor";

let formJSON = JSON.stringify(JSON.stringify(require("./test-form.json")));
formJSON = formJSON.substring(1, formJSON.length - 1);

const enterLongTextToInput = async (selector: string, text: string) => {
	const $input = $(selector);
	// eslint-disable-next-line max-len
	await browser.executeScript(`document.querySelector("${selector}").value = \`${text}\``);
	await $input.sendKeys(" ");
};

describe("Builder", () => {
	let builder: BuilderPO;

	beforeAll(async() => {
		builder = await createBuilder();
	});

	describe("Create or list", () => {
		it("Create option is displayed",  async () => {
			expect(await isDisplayed(builder.create.$createButton)).toBe(true);
		});

		it("can be selected",  async () => {
			await builder.create.$createButton.click();
			expect(await isDisplayed(builder.create.$jsonButton));
		});
	});

	describe("JSON", () => {
		it("option is displayed",  async () => {
			expect(await isDisplayed(builder.create.$jsonButton)).toBe(true);
		});

		it("can be selected",  async () => {
			await builder.create.$jsonButton.click();
			expect(await isDisplayed(builder.create.json.$input));
		});

		it("builds form", async () => {
			await enterLongTextToInput(builder.create.json.inputSelector, formJSON);
			await builder.create.json.$submit.click();
			await builder.waitUntilLoaded();
			expect(await isDisplayed(builder.formPreview.$container)).toBe(true);
		});
	});

	describe("databank option", () => {
		beforeAll(async () => {
			builder = await createBuilder();
			await builder.create.$createButton.click();
		});

		it("option is displayed", async () => {
			expect(await isDisplayed(builder.create.$DatabankButton)).toBe(true);
		});
	});

	describe("lang", () => {
		beforeAll(async() => {
			builder = await createBuilder();
			await builder.create.$createButton.click();
			await builder.create.$jsonButton.click();
			await enterLongTextToInput(builder.create.json.inputSelector, formJSON);
			await builder.create.json.$submit.click();
			await builder.waitUntilLoaded();
		});

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
});
