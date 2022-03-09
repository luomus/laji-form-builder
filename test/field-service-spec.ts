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
			});
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
				"MHL.40": "value_options discontinued",
				"MHL.83": "uses nonexisting HRA.items. Not used but saved for future reference",
				"MHL.78": "old backend doesn't like it cause gatheringEvent has a fieldset without fields. New backend will accept.",
				"MHL.77": "old backend doesn't like it cause gatheringEvent has a fieldset without fields. New backend will accept.",
				"MHL.23": "enum with altParent not expanded to extra & uiSchemaContext in old form backend correctly",
				"MHL.19": "old form backend incorrectly return empty schema as []",
				// "MHL.6": "prepopulatedDocument backward compatibility broken",
			};
			/* eslint-enable max-len */

			const skipContext: Record<string, true> = {
				"MHL.103": true,
				"MHL.73": true,
				"MHL.55": true,
				"MHL.47": true,
				"MHL.39": true,
				"MHL.37": true,
				"MHL.32": true,
			};

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

				if (id === "MHL.6") {
					delete master.options.prepopulatedDocument;
					delete master.options.prepopulateWithInformalTaxonGroups;
					delete schemas.options.prepopulatedDocument;
					delete schemas.options.prepopulateWithInformalTaxonGroups;
				}

				try {
					console.log(id);
					const jsonFormat = await fieldService.masterToSchemaFormat(master, LANG);
					if (skipContext[id]) {
						delete jsonFormat.context;
					}
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
			expect(jsonFormat.options.prepopulatedDocument.gatherings[0].units[0].recordBasis)
				.toBe("MY.recordBasisHumanObservation");
		});


		it("prepopulateWithInformalTaxonGroups fills taxon data", async () => {
			expect(jsonFormat.options.prepopulatedDocument.gatherings[0].units.length).toBeGreaterThan(1);
			const identification = jsonFormat.options.prepopulatedDocument.gatherings[0].units[0].identifications[0];
			expect(identification.taxon).toBe("Parnassius apollo");
			expect(identification.taxonID).toBe("MX.60724");
			expect(identification.taxonVerbatim).toBe("isoapollo");
		});
	});

	describe("Extending form with field with formID", () => {
		const extendedID =  "JX.519";
		const form = { fields: [{formID: extendedID}] };
		let extendedSchemaFormat: SchemaFormat;

		beforeAll(async () => {
			extendedSchemaFormat = await formService.getSchemaFormat(extendedID);
		});

		it("return fields and nothing else from extended form", async () => {
			const jsonFormat = await fieldService.masterToSchemaFormat(form, LANG);
			expect(jsonFormat.schema).toEqual(extendedSchemaFormat.schema);
			(["options", "id", "title", "shortDescription",
				"translations", "uiSchema"] as (keyof SchemaFormat)[]).forEach(prop => {
				expect(jsonFormat).not.toContain(prop);
			});
		});

		it("can be patched", async () => {
			const _form = {
				...form,
				patch: [
					{
						op: "add",
						path: "/fields/1/options/whitelist/-",
						value: "MX.secureLevelKM100"
					},
				]
			};
			const jsonFormat = await fieldService.masterToSchemaFormat(_form, LANG);
			const { enum: _enum } = jsonFormat.schema.properties.secureLevel;
			expect(_enum[_enum.length - 1]).toEqual( "MX.secureLevelKM100");
		});
	});
});
