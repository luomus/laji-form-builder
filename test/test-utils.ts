import { $, protractor, browser, ElementFinder } from "protractor";
import { gnmspc, nmspc } from "../src/utils";
import { navigateToForm, emptyForm, lajiFormLocate } from "laji-form/test-export/test-utils";

const EC = protractor.ExpectedConditions;

// Class namespace
const cnmspc = (fn: (str: string) => string) => (str: string) => `.${(fn(str))}`;
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
		const query = (params: any) => Object.keys(params).reduce((q, key) =>
			`${q}&${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`
		, "");
		if (this.props.id) {
			const {id, ..._props} = this.props;
			await navigateToForm(id, query(_props));
			await this.waitUntilLoaded();
		} else {
			await emptyForm();
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
		$active: this.$langsContainer.$(".active")
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
		$container: $("#app > .laji-form"),
		locate: lajiFormLocate
	}

	$fieldSelectorContainer = $(gcnmspc("field-chooser"))
	$fieldEditor = $(gcnmspc("field-editor"))
	$rootFieldSelector = this.$fieldSelectorContainer.$(`:scope > ${gcnmspc("field")}`);
	getFieldSelector = ($field: ElementFinder): FieldSelectorPO => ({
		$field,
		label: $field.$(`:scope > span > ${gcnmspc("field-label")}`).getText() as Promise<string>,
		getFieldSelectors: () => new Promise(resolve => $field.$$(`:scope > div > ${gcnmspc("field")}`).then($es => resolve($es.map((($e: ElementFinder) => this.getFieldSelector($e))))))
	});
	getActiveField = () => this.getFieldSelector(this.$fieldSelectorContainer.$(`${gcnmspc("field-selected")}`));

	private $optionsEditorContainer = $(gcnmspc("options-editor"));
	optionsEditor = {
		$container: this.$optionsEditorContainer,
		$spinner: this.$optionsEditorContainer.$(":scope > .react-spinner"),
		$form: this.$optionsEditorContainer.$(".laji-form"),
		waitUntilLoaded: () => (browser.wait(EC.visibilityOf(this.optionsEditor.$form)) as Promise<void>)
	}

	async waitUntilLoaded() {
		await (browser.wait(EC.visibilityOf(this.formPreview.$container)) as Promise<void>);
		await (browser.wait(EC.visibilityOf(this.$toolbar)) as Promise<void>);
		return;
	}

	$pickerButton = $(gcnmspc("elem-picker"));
	picker = {
		$button: this.$pickerButton,
		isButtonActive: () => isDisplayed(this.$pickerButton.$(".active")),
		$highlighter: $(gcnmspc("picker-highlighter"))
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
