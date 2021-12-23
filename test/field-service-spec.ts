import MetadataService from "../src/services/metadata-service";
import FieldService from "../src/services/field-service";
import FormService from "../src/services/form-service";
import ApiClientImplementation from "../playground/ApiClientImplementation";
import ApiClient from "laji-form/lib/ApiClient";
import properties from "../properties.json";
import { FormListing, Master, SchemaFormat } from "../src/model";

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

	const forms: {id: string, title: string}[] = [
		{id: "JX.519", title: "Trip report"},
		{id: "MHL.70", title: "Dataset primary base"}, // Tests baseFormID
		{id: "MHL.93", title: "Coll Mikko Heikkinen"}, // Tests baseFormID with extending options
		{id: "MHL.1", title: "Line transect"},
		{id: "MHL.27", title: "Line transect (non-standard)"}, // Tests form with patches
		{id: "JX.111712", title: "Media metadata"}, // Tests form for MM.image/MM.audio
		{id: "MHL.36", title: "Named place"}, // Tests form for MNP.namedPlace
		{id: "MHL.15", title: "Annotation"} // Tests form for MAN.annotation
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
		});
	}
});
