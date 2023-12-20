import { Page, Locator, expect } from "@playwright/test";
import { classNames, gnmspc, nmspc } from "../../src/client/utils";
import { Form } from "@luomus/laji-form/test-export/test-utils";
import { Lang } from "../../src/model";

// Class namespace
const cnmspc = (fn: (str?: string) => string) => (str?: string) => `.${(fn(str))}`;
// Global namespace
const gcnmspc = (str: string): string => cnmspc(gnmspc)(str);

type DiffBase = {path: string};
type DiffNew = {kind: "new"; rhs: any} & DiffBase;
type DiffEdit = {kind: "edit"; lhs: any; rhs: any;} & DiffBase;
type DiffDelete = {kind: "delete"} & DiffBase;

export type Diff = DiffNew | DiffEdit | DiffDelete;

export class BuilderPO {
	constructor(private page: Page) {
	}

	nmspc = cnmspc(nmspc("editor"));

	$editor = this.page.locator(this.nmspc(""));
	$toolbar = this.page.locator(this.nmspc("toolbar"));
	$toolbarSpinner = this.page.locator(this.nmspc("toolbar-loader"));

	private $langsContainer = this.$toolbar.locator(this.nmspc("lang-chooser"));
	private $$langs = this.$langsContainer.locator("button");
	lang = {
		$fi: this.$$langs.nth(0),
		$sv: this.$$langs.nth(1),
		$en: this.$$langs.nth(2),
		$active: this.$langsContainer.locator(".active"),
		changeTo: async (lang: Lang) => {
			await this.$$langs.getByText(lang).click();
			await expect(this.formPreview.$form).toHaveClass(new RegExp(lang));
		}
	};

	private $tabsContainer = this.$toolbar.locator(gcnmspc("tabs"));
	private $$mainTabs = this.$tabsContainer.locator(gcnmspc("tab"));
	mainTabs = {
		$options: this.$$mainTabs.nth(0),
		$fields: this.$$mainTabs.nth(1),
		$active: this.$tabsContainer.locator(gcnmspc("active"))
	};

	$fieldToolbar = this.page.locator(gnmspc("field-editor-toolbar"));

	private $fieldTabsContainer = this.page.locator(gcnmspc("field-editor-toolbar") + gcnmspc("tabs"));
	private $$fieldTabs = this.$fieldTabsContainer.locator(gcnmspc("tab"));
	fieldTabs = {
		$basic: this.$$fieldTabs.nth(0),
		$ui: this.$$fieldTabs.nth(1),
		$active: this.$fieldTabsContainer.locator(gcnmspc("active"))
	}

	formPreview = new Form(this.page, this.page.locator("#app > .laji-form"))

	$fieldSelectorContainer = this.page.locator(gcnmspc("field-chooser"))
	$fieldEditor = this.page.locator(gcnmspc("field-editor"))
	$rootFieldSelector = this.$fieldSelectorContainer.locator(`:scope > ${gcnmspc("field")}`);
	getFieldSelector = ($field: Locator)=> ({
		$field,
		$label: $field.locator(gcnmspc("field-label")),
		getFieldSelectors: async () => {
			const $es = await $field.locator(`:scope > div > ${gcnmspc("field")}`).all();
			return $es.map($e => this.getFieldSelector($e))
		}
	});
	getFieldSelectorByJSONPath = (path: string) =>
		this.getFieldSelector(this.page.locator(`${gcnmspc("field")}${path.replace(/\//g, "-")}`));
	$activeField = this.getFieldSelector(this.$fieldSelectorContainer.locator(`${gcnmspc("field-selected")}`));
	getFieldByPointer = (pointer: string) => this.page.locator(gcnmspc(`field-document-${pointer.replace(/\./g, "-")}`))
	activateFieldByPointer = async (pointer: string) => {
		let splittedCumulated = "";
		for (const split of pointer.split(".")) {
			splittedCumulated += split;
			await this.getFieldByPointer(splittedCumulated).click();
			splittedCumulated += ".";
		}
	}

	private $optionsEditorContainer = this.page.locator(gcnmspc("options-editor"));
	optionsEditor = {
		$container: this.$optionsEditorContainer,
		$spinner: this.$optionsEditorContainer.locator(`${gcnmspc("field-editor")} > .react-spinner`),
		$form: this.$optionsEditorContainer.locator(".laji-form"),
		tabs: {
			$UI: this.$optionsEditorContainer.locator(gcnmspc("tab")).nth(0),
			$JSON: this.$optionsEditorContainer.locator(gcnmspc("tab")).nth(1),
			$active: this.$optionsEditorContainer.locator(gcnmspc("tabs")).locator(gcnmspc("active"))
		}
	}

	editorForm = new Form(this.page, this.$editor.locator(".laji-form"));

	async waitUntilLoaded() {
		await expect(this.formPreview.$form).toBeVisible({timeout: 30 * 1000});
		await expect(this.$toolbar).toBeVisible();
		await expect(this.$toolbarSpinner).toBeHidden();
	}

	$pickerButton = this.page.locator(gcnmspc("elem-picker"));
	picker = {
		$button: this.$pickerButton,
		$highlighter: this.page.locator(gcnmspc("picker-highlighter"))
	}

	wizardNmspc = cnmspc(nmspc("creator-wizard"));
	$creator = this.page.locator(this.wizardNmspc());

	create = {
		$createButton: this.page.locator(this.wizardNmspc("create-create")),
		$jsonButton: this.page.locator(this.wizardNmspc("create-json")),
		$DatabankButton: this.page.locator(this.wizardNmspc("create-databank")),
		json: {
			inputSelector: classNames(this.wizardNmspc("json"), gcnmspc("json-editor")),
			$input: this.page.locator(this.wizardNmspc("json")).locator("textarea"),
			$submit: this.page.locator(this.wizardNmspc("json")).locator(this.wizardNmspc("json-preview-btn"))
		}
	}

	saveModal = {
		open: () => this.page.locator(`#${gnmspc("open-save-view")}`).click(),
		close: () => this.page.locator(gcnmspc("save-modal")).locator(".close").click(),
		getDiff: async () => {
			const diffNmspc = nmspc("diff");
			const diffCnmspc = cnmspc(diffNmspc);
			const mapClassToKind = (className: string): Diff["kind"] => {
				switch (className) {
				case diffNmspc("new"):
					return "new";
				case diffNmspc("edit"):
					return "edit";
				case diffNmspc("delete"):
					return "delete";
				}
				throw new Error(`unknown diff kind ${className}`);
			};

			const $container = this.page.locator(diffCnmspc());

			const $rows = await $container.locator("tr").all();
			return $rows.reduce(async (rowsAsync: Promise<Diff[]>, $tr: Locator) => {
				const rows = await rowsAsync;
				const kind = mapClassToKind(await $tr.getAttribute("class") as string);
				const ALL_DOTS = /\./g;
				const path = "/" + (await $tr.locator("th").textContent())!.replace(ALL_DOTS, "/");
				const parseEdit = (text: string) => text.split(" ➞ ").map(v => JSON.parse(v));
				if (kind === "new") {
					rows.push({kind, path, rhs: JSON.parse(await $tr.locator("td").textContent() as string)});
				} else if (kind === "edit") {
					const [lhs, rhs] = parseEdit(await $tr.locator("td").textContent() as string);
					rows.push({kind, path, lhs, rhs});
				} else {
					rows.push({kind, path});
				}
				return rows;
			}, Promise.resolve([]));
		}
	}
}

export async function createBuilder(page: Page, id = ""): Promise<BuilderPO> {
	await page.goto(`/${id}`);
	const builder = new BuilderPO(page);
	return builder;
}
