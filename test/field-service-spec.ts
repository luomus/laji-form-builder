import MetadataService from "../src/services/metadata-service";
import FieldService from "../src/services/field-service";
import FormService from "../src/services/form-service";
import ApiClientImplementation from "../playground/ApiClientImplementation";
import ApiClient from "laji-form/lib/ApiClient";
import properties from "../properties.json";
import { Master, Schemas } from "../src/model";

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
		{id: "JX.519", label: "trip report"},
		{id: "MHL.70", label: "Dataset primary base"},
		{id: "MHL.93", label: "Coll Mikko Heikkinen"}
	];

	for (const {label, id} of forms) {
		describe(`${label} (${id})`, () => {
			let master: Master;
			let schemas: Schemas;
			beforeAll(async () => {
				master = await formService.getMaster(id);
				schemas = await formService.getSchemas(id);
			});

			let jsonFormat: Schemas;

			it("converts without errors", async () => {
				jsonFormat = await fieldService.masterToJSONFormat(master);
			});

			it("converts schema correct", () => {
				const {schema} = jsonFormat;
				expect(schema).toEqual(schemas.schema);
			});

			it("converts uiSchema correct", () => {
				const {uiSchema} = jsonFormat;
				expect(uiSchema).toEqual(schemas.uiSchema);
			});

			it("converts options correct", () => {
				const {options} = jsonFormat;
				expect(options).toEqual(schemas.options);
			});
		});
	}
});
