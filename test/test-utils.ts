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
	$langsContainer = this.$toolbar.$(this.nmspc("lang-chooser"));
	$$langs = this.$langsContainer.$$(this.nmspc("lang-chooser button"));
	lang = {
		$fi: this.$$langs.get(0),
		$sv: this.$$langs.get(1),
		$en: this.$$langs.get(2),
		$active: this.$langsContainer.$(".active")
	};
	$tabsContainer = this.$toolbar.$(this.nmspc("chooser"));
	$$tabs = this.$tabsContainer.$$(this.nmspc("chooser-button"));
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
	$rootFieldSelector = $(gcnmspc("field"));
	getFieldSelector = ($field: ElementFinder): FieldSelectorPO => ({
		$field,
		label: $field.$(gcnmspc("field-label")).getText() as Promise<string>,
		getFieldSelectors: () => new Promise(resolve => $field.$$(gcnmspc("field")).then($es => resolve($es.map((($e: ElementFinder) => this.getFieldSelector($e))))))
		//getFieldSelectors: () => ($field.$$(gcnmspc("field")).map($e => this.getFieldSelector($e as ElementFinder)) as Promise<FieldSelectorPO[]>)
	});

	async waitUntilLoaded()  {
		await (browser.wait(EC.visibilityOf(this.formPreview.$container)) as Promise<void>);
		await (browser.wait(EC.visibilityOf(this.$toolbar)) as Promise<void>);
		return;
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
