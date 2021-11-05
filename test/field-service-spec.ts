import MetadataService from "../src/services/metadata-service";
import FieldService from "../src/services/field-service";
import FormService from "../src/services/form-service";
import ApiClientImplementation from "../playground/ApiClientImplementation";
import ApiClient from "laji-form/lib/ApiClient";
import properties from "../properties.json";
import { Master, SchemaFormat } from "../src/model";

const LANG = "fi";

const apiClient = new ApiClient(new ApiClientImplementation(
	"https://apitest.laji.fi/v0",
	properties.accessToken,
	properties.userToken,
	LANG
), LANG, {fi: {}, sv: {}, en: {}});

describe("Field service", () => {

	const fieldService = new FieldService(new MetadataService(apiClient, LANG), new FormService(apiClient), LANG);
	const formService = new FormService(apiClient);

	const forms: {id: string, label: string}[] = [
		{id: "JX.519", label: "Trip report"},
		{id: "MHL.70", label: "Dataset primary base"}, // Tests baseFormID
		{id: "MHL.93", label: "Coll Mikko Heikkinen"}, // Tests baseFormID with exthending options
		{id: "MHL.1", label: "Line transect"},
		{id: "MHL.27", label: "Line transect (non-standard)"} // Tests form with patches
	];

	for (const {label, id} of forms) {
		describe(`${label} (${id})`, () => {
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

			(["schema", "uiSchema", "options", "validators", "warnings", "excludeFromCopy", "attributes"] as (keyof SchemaFormat)[]).forEach(prop => {
				it(`converts ${prop} correct`, () => {
					expect(jsonFormat[prop]).toEqual(schemas[prop]);
				});
			});
		});
	}
});
