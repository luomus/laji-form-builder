import ApiClient from "laji-form/lib/ApiClient";
import ApiClientImplementation from "../../src/server/view/ApiClientImplementation";
import config from "../../config.json";
import FieldService from "../../src/server/services/field-service";
import MetadataService from "../../src/services/metadata-service";
import { SchemaFormat } from "../../src/model";

const LANG = "fi";

const apiClient = new ApiClient(new ApiClientImplementation(
	config.apiBase,
	config.accessToken,
	config.userToken,
	LANG
), LANG, {fi: {}, sv: {}, en: {}});
const fieldService = new FieldService(apiClient, new MetadataService(apiClient, LANG), LANG);

describe("prepopulatedDocument population", () => {
	let jsonFormat: SchemaFormat;

	beforeAll(async () => {
		const fields = [
			{name: "MY.gatherings",
				fields: [
					{name: "MY.units",
						fields: [
							{name: "MY.identifications",
								fields: [
									{name: "MY.taxon"},
									{name: "MY.taxonVerbatim"},
									{name: "MY.taxonID"},
								]},
							{name: "MY.recordBasis",
								options: {
									default: "MY.recordBasisHumanObservation"
								}
							}
						]
					}
				]
			}
		];
		const form = {
			fields,
			options: {
				prepopulateWithInformalTaxonGroups: ["MVL.181"],
				prepopulatedDocument: {
					gatherings: [{
						units: [{
							notes: "foo"
						}]
					}]
				}
			}
		};
		jsonFormat = await fieldService.masterToSchemaFormat(form, LANG);
	});

	it("merges prepopulatedDocument and prepopulateWithInformalTaxonGroups", async () => {
		expect(jsonFormat.options.prepopulatedDocument.gatherings.length).toBe(1);
		const gathering = jsonFormat.options.prepopulatedDocument.gatherings[0];
		expect(gathering.units[0].notes).toBe("foo");
		expect(gathering.units[0].identifications[0].taxon).toBeTruthy();
	});

	it("populates with defaults", async () => {
		jsonFormat.options.prepopulatedDocument.gatherings[0].units.forEach((unit: any,idx: number) => {
			console.log(unit.recordBasis, idx);
			expect(unit.recordBasis).toBe("MY.recordBasisHumanObservation");
		});
	});


	it("prepopulateWithInformalTaxonGroups fills taxon data", async () => {
		expect(jsonFormat.options.prepopulatedDocument.gatherings[0].units.length).toBeGreaterThan(1);
		const identification = jsonFormat.options.prepopulatedDocument.gatherings[0].units[0].identifications[0];
		expect(identification.taxon).toBe("Parnassius apollo");
		expect(identification.taxonID).toBe("MX.60724");
		expect(identification.taxonVerbatim).toBe("isoapollo");
	});
});
