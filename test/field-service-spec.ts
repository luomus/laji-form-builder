import MetadataService from "../src/metadata-service";
import FieldService from "../src/field-service";
import FormService from "../src/form-service";
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
	const fieldService = new FieldService(new MetadataService(apiClient), LANG);
	const formService = new FormService(apiClient);

	describe("trip report (JX.519)", () => {
		let master: Master;
		let schemas: Schemas;
		beforeAll(async () => {
			master = await formService.getMaster("JX.519");
			schemas = await formService.getSchemas("JX.519");
		});

		it("converts schema correct", async () => {
			const schema = await fieldService.masterToJSONSchema(master);
			expect(schema).toEqual(schemas.schema);
		});
	});
});
