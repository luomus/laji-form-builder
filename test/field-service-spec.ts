import MetadataService from "../src/services/metadata-service";
import FieldService from "../src/services/field-service";
import FormService from "../src/services/form-service";
import ApiClientImplementation from "../playground/ApiClientImplementation";
import ApiClient from "laji-form/lib/ApiClient";
import properties from "../properties.json";
import { FormListing, Master, SchemaFormat } from "../src/model";
import deepEqual from "deep-equal";

const LANG = "fi";

const apiClient = new ApiClient(new ApiClientImplementation(
	"https://apitest.laji.fi/v0",
	properties.accessToken,
	properties.userToken,
	LANG
), LANG, {fi: {}, sv: {}, en: {}});

describe("Field service", () => {

	const formService = new FormService(apiClient, LANG);
	const fieldService = new FieldService(apiClient, new MetadataService(apiClient, LANG), formService, LANG);

	const forms: {id: string, title: string}[] = [
		{id: "JX.519", title: "Trip report"},
		{id: "MHL.70", title: "Dataset primary base"}, // baseFormID
		{id: "MHL.93", title: "Coll Mikko Heikkinen"}, // baseFormID with extending options
		{id: "MHL.1", title: "Line transect"},
		{id: "MHL.27", title: "Line transect (non-standard)"}, // patches && base form ID in fields
		{id: "MHL.28", title: "Line transect (non-standard kartoitus)"}, // recursive base form ID expansion
		{id: "JX.111712", title: "Media metadata"},
		{id: "MHL.36", title: "Named place"},
		{id: "MHL.15", title: "Annotation"}
	];

	for (const {title, id} of forms) {
		describe(`${title} (${id})`, () => {
			let master: Master;
			let schemas: SchemaFormat;

			beforeAll(async () => {
				master = await formService.getMaster(id);
				schemas = await formService.getSchemaFormat(id);
			});

			let jsonFormat: SchemaFormat;

			it("converts without errors", async () => {
				jsonFormat = await fieldService.masterToSchemaFormat(master);
			});

			(["schema",
				"uiSchema",
				"options",
				"validators",
				"warnings",
				"excludeFromCopy",
				"attributes",
				"extra",
				"uiSchemaContext"
			] as (keyof SchemaFormat)[]).forEach(prop => {
				it(`converts ${prop} correct`, () => {
					expect(jsonFormat[prop]).toEqual(schemas[prop]);
				});
			});
			it("converts all correct", () => {
				expect(jsonFormat).toEqual(schemas);
			})
		});
	}

	describe("converts all correct", () => {
		let _forms: FormListing[];

		beforeAll(async () => {
			_forms = await formService.getForms();
		});

		it("", async () => {

			/* eslint-disable max-len */
			const skips: Record<string, string> = {
				"MHL.40": "value_options patch should be removed?",
				"MHL.83": "uses nonexisting HRA.items?",
				"MHL.78": "fieldset field should have prefix & no need to tell that its a fieldset, root domain should be explicit?",
				"MHL.77": "fieldset field should have prefix & no need to tell that its a fieldset, root domain should be explicit?",
				"MHL.23": "enum with altParent not expanded to extra & uiSchemaContext in old form backend correctly",
				"MHL.19": "old form backend incorrectly return empty schema as []"
			};
			/* eslint-enable max-len */

			for (const {id} of _forms) {
				if (forms.some(f => f.id === id)) {
					continue;
				}
				if (skips[id]) {
					console.log(`Skipping ${id}: ${skips[id]}`);
					continue;
				}
				const master = await formService.getMaster(id);
				const schemas = await formService.getSchemaFormat(id);
				try {
					console.log(id);
					const jsonFormat = await fieldService.masterToSchemaFormat(master, LANG);
					// toEqual can't carry message so log the form manually.
					if (!deepEqual(jsonFormat, schemas)) {
						console.log(`Didn't convert ${id} (${master.name}) correct`);
						break;
					}
					expect(jsonFormat).toEqual(schemas);
				} catch (e) {
					fail(`Didn't convert ${id} (${master.name}) correct (CRASHED)`);
					break;
				}
			}
		});
	});
});
