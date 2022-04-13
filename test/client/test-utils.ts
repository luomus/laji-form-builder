import { $, protractor, browser, ElementFinder as _ElementFinder, by, element } from "protractor";
import { classNames, gnmspc, nmspc } from "../../src/client/utils";
import { lajiFormLocate, getLocatorForContextId } from "laji-form/test-export/test-utils";
import { Lang } from "../../src/model";

const { HOST, PORT } = process.env;

const EC = protractor.ExpectedConditions;

export declare class ElementFinder extends _ElementFinder {
		then: (fn: (value: any) => any, errorFn?: (error: any) => any) => Promise<any>;
}

// Class namespace
const cnmspc = (fn: (str: string) => string) => (str: string) => `.${(fn(str))}`;
// Global namespace
const gcnmspc = (str: string): string => cnmspc(gnmspc)(str);

interface BuilderPOProps {
	id?: string
}

export class BuilderPO {
	props: BuilderPOProps;
	constructor(props: BuilderPOProps = {}) {
		this.props = props;
	}
	async initialize() {
		if (this.props.id) {
			await browser.get(`http://${HOST}:${PORT}/${this.props.id}`);
			await this.waitUntilLoaded();
		} else {
			await browser.get(`http://${HOST}:${PORT}`);
		}
	}

	nmspc = cnmspc(nmspc("editor"));

	$editor = $(this.nmspc(""));
	$toolbar = $(this.nmspc("toolbar"));

	private $langsContainer = this.$toolbar.$(this.nmspc("lang-chooser"));
	private $$langs = this.$langsContainer.$$(this.nmspc("lang-chooser button"));
	lang = {
		$fi: this.$$langs.get(0),
		$sv: this.$$langs.get(1),
		$en: this.$$langs.get(2),
		$active: this.$langsContainer.$(".active"),
		changeTo: async (lang: Lang) => {
			function waitForCssClass(elem$: ElementFinder, desiredClass: string) {
				return async function () {
					const className = await elem$.getAttribute("class");
					return className && className.indexOf(desiredClass) >= 0;
				};
			}
			const order: Record<Lang, number> = {fi: 0, sv: 1, en: 2};
			const idx = order[lang];
			await this.$$langs.get(idx).click();
			await browser.wait(waitForCssClass(this.formPreview.$rjsf, lang));
		}
	};

	private $tabsContainer = this.$toolbar.$(this.nmspc("chooser"));
	private $$tabs = this.$tabsContainer.$$(this.nmspc("chooser-button"));
	tabs = {
		$options: this.$$tabs.get(0),
		$basic: this.$$tabs.get(1),
		$ui: this.$$tabs.get(2),
		$active: this.$tabsContainer.$(gcnmspc("active"))
	};
	formPreview = {
		$container: $("#app > .laji-form") as ElementFinder,
		$rjsf: $("#app > .laji-form form") as ElementFinder,
		locate: lajiFormLocate
	}

	$fieldSelectorContainer = $(gcnmspc("field-chooser")) as ElementFinder
	$fieldEditor = $(gcnmspc("field-editor")) as ElementFinder
	$rootFieldSelector = this.$fieldSelectorContainer.$(`:scope > ${gcnmspc("field")}`) as ElementFinder;
	getFieldSelector = ($field: ElementFinder): FieldSelectorPO => ({
		$field,
		label: $field.$(`:scope > span > ${gcnmspc("field-label")}`).getText() as Promise<string>,
		getFieldSelectors: () => new Promise(resolve => $field.$$(`:scope > div > ${gcnmspc("field")}`).then(
			$es => resolve($es.map((($e: ElementFinder) => this.getFieldSelector($e))))
		))
	});
	getActiveField = () => this.getFieldSelector(
		this.$fieldSelectorContainer.$(`${gcnmspc("field-selected")}`) as ElementFinder
	);
	getFieldByPointer = (pointer: string) => $(gcnmspc(`field-document-${pointer.replace(/\./g, "-")}`))
	activateFieldByPointer = async (pointer: string) => {
		let splittedCumulated = "";
		for (const split of pointer.split(".")) {
			splittedCumulated += split;
			await this.getFieldByPointer(splittedCumulated).click();
			splittedCumulated += ".";
		}
	}

	private $optionsEditorContainer = $(gcnmspc("options-editor"));
	optionsEditor = {
		$container: this.$optionsEditorContainer,
		$spinner: this.$optionsEditorContainer.$(":scope > .react-spinner") as ElementFinder,
		$form: this.$optionsEditorContainer.$(".laji-form") as ElementFinder,
		waitUntilLoaded: () => (browser.wait(EC.visibilityOf(this.optionsEditor.$form)) as Promise<void>)
	}

	async editorLocate(path: string): Promise<ElementFinder> {
		const $root = this.$editor.$(".laji-form .rjsf > div");
		const id = await $root.getAttribute("id");
		const contextId = id.match(/\d+/)?.[0];
		if (typeof contextId !== "string") {
			throw "No form found for editorLocate()";
		}
		const asNumber = +contextId;
		if (typeof asNumber !== "number" || isNaN(asNumber)) {
			throw "No form found for editorLocate()";
		}
		return element(by.id(getLocatorForContextId(asNumber)(path).substr(1))) as ElementFinder;
	}

	async waitUntilLoaded() {
		await (browser.wait(EC.visibilityOf(this.formPreview.$container)) as Promise<void>);
		await (browser.wait(EC.visibilityOf(this.$toolbar)) as Promise<void>);
		return;
	}

	$pickerButton = $(gcnmspc("elem-picker"));
	picker = {
		$button: this.$pickerButton as ElementFinder,
		isButtonActive: () => isDisplayed(this.$pickerButton.$(".active") as ElementFinder),
		$highlighter: $(gcnmspc("picker-highlighter")) as ElementFinder
	}

	wizardNmspc = cnmspc(nmspc("creator-wizard"));
	$creator = $(this.wizardNmspc(""));

	create = {
		$createButton: $(this.wizardNmspc("create-create")) as ElementFinder,
		$jsonButton: $(this.wizardNmspc("create-json")) as ElementFinder,
		$DatabankButton: $(this.wizardNmspc("create-databank")) as ElementFinder,
		json: {
			inputSelector: classNames(this.wizardNmspc("json"), gcnmspc("json-editor")),
			$input: $(this.wizardNmspc("json")).$("textarea") as ElementFinder,
			$submit: $(this.wizardNmspc("json")).$("button") as ElementFinder
		}
	}
}

export interface FieldSelectorPO {
	$field: ElementFinder;
	label: Promise<string>;
	getFieldSelectors: () => Promise<FieldSelectorPO[]>;
}

export async function createBuilder(props?: BuilderPOProps): Promise<BuilderPO> {
	const builder = new BuilderPO(props);
	await builder.initialize();
	return builder;
}

export const isDisplayed = async ($elem: ElementFinder) => (await $elem.isPresent()) && (await $elem.isDisplayed());
