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

const uiSchema = {
	gatherings: {
	}
};

// describe("prepopulatedDocument population", () => {
// 	let jsonFormat: SchemaFormat;
// 	beforeAll(async () => {
// 		const form = {
// 			fields,
// 			options: {
// 				prepopulateWithInformalTaxonGroups: ["MVL.181"],
// 				prepopulatedDocument: {
// 					gatherings: [{
// 						units: [{
// 							notes: "foo"
// 						}]
// 					}]
// 				}
// 			}
// 		};
// 		jsonFormat = await fieldService.masterToSchemaFormat(form, LANG);
// 	});
//
// 	it("merges prepopulatedDocument and prepopulateWithInformalTaxonGroups", async () => {
// 		expect(jsonFormat.options.prepopulatedDocument.gatherings.length).toBe(1);
// 		const gathering = jsonFormat.options.prepopulatedDocument.gatherings[0];
// 		expect(gathering.units[0].notes).toBe("foo");
// 		expect(gathering.units[0].identifications[0].taxon).toBeTruthy();
// 	});
//
// 	it("populates with defaults", async () => {
// 		jsonFormat.options.prepopulatedDocument.gatherings[0].units.forEach((unit: any,idx: number) => {
// 			expect(unit.recordBasis).toBe("MY.recordBasisHumanObservation");
// 		});
// 	});
//
//
// 	it("prepopulateWithInformalTaxonGroups fills taxon data", async () => {
// 		expect(jsonFormat.options.prepopulatedDocument.gatherings[0].units.length).toBeGreaterThan(1);
// 		const identification = jsonFormat.options.prepopulatedDocument.gatherings[0].units[0].identifications[0];
// 		expect(identification.taxon).toBe("Parnassius apollo");
// 		expect(identification.taxonID).toBe("MX.60724");
// 		expect(identification.taxonVerbatim).toBe("isoapollo");
// 	});
// });

describe("patching", () => {
	const patch = [
		{
			op: "add",
			path: "/fields/0/fields/-",
			value: {
				name: "MY.municipality",
				label: "foo"
			}
		},
		{
			op: "add",
			path: "/fields/0/fields/-",
			value: {
				"name": "MY.locality",
				label: "bar"
			}
		}
	];

	it("done against master format", async() => {
		const form = {
			fields,
			uiSchema,
			patch: [patch[0]]
		};
		const jsonFormat = await fieldService.masterToSchemaFormat(form, LANG);
		expect(jsonFormat.schema.properties.gatherings.items.properties.municipality.title).toBe("foo");
	});

	it("works with multiple on same target", async () => {
		const form = {
			fields,
			uiSchema,
			patch
		};

		const jsonFormat = await fieldService.masterToSchemaFormat(form, LANG);

		expect(jsonFormat.schema.properties.gatherings.items.properties.municipality.title).toBe("foo");
		expect(jsonFormat.schema.properties.gatherings.items.properties.locality.title).toBe("bar");
	});

	it("works with multiple on different target", async () => {
		const form = {
			fields,
			uiSchema,
			patch: [
				{
					op: "add",
					path: "/fields/0/fields/-",
					value: {
						name: "MY.municipality",
						label: "foo"
					}
				},
				{
					op: "add",
					path: "/uiSchema/municipality",
					value: "foo"
				}
			]
		};

		const jsonFormat = await fieldService.masterToSchemaFormat(form, LANG);

		expect(jsonFormat.schema.properties.gatherings.items.properties.municipality.title).toBe("foo");
		expect(jsonFormat.uiSchema.municipality).toBe("foo");
	});
});
