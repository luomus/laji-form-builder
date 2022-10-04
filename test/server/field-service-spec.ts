import config from "../../config.json";
import FieldService from "../../src/server/services/field-service";
import MetadataService from "../../src/services/metadata-service";
import { SchemaFormat, Master, JSONSchemaObject } from "../../src/model";
import ApiClient from "../../src/api-client";
import StoreService from "../../src/server/services/store-service";

const LANG = "fi";
const mock = !(process.env.MOCK === "false");

class MockApiClient extends ApiClient {
	mock(path: string, query?: any, options?: any): Response | undefined {
		if (options?.method) {
			return undefined;
		}
		const queryString = new URLSearchParams(query);
		const uri = queryString ? `${path}?${queryString}` : path;
		let result: any;
		try {
			// Mock files have '-' in place of '/' since slash isn't an allowed character in filenames in UNIX.
			result = require(`./mock-responses/${uri.substr(1).replace(/\//g, "-")}.json`);
		} catch (e) {
			console.warn(`No mock response found in test/server/mock-responses for ${uri}`);
		}
		// let result: any = (mocks as any)[uri];
		return result
			? {
				status: 200, json: () => result, ok: true
			} as Response
			: undefined;
	}

	fetch(path: string, query?: any, options?: any) {
		const mockResponse = this.mock(path, query , options);
		if (mockResponse) {
			return Promise.resolve(mockResponse);
		} else {
			return super.fetch(path, query, options);
		}
	}
}

const apiClientImpl = (...args: ConstructorParameters<typeof ApiClient>) => mock
	? new MockApiClient(...args)
	: new ApiClient(...args);

const apiClient = apiClientImpl(
	config.apiBase,
	config.accessToken,
	undefined,
	LANG
);

const fieldService = new FieldService(apiClient, new MetadataService(apiClient, LANG), new StoreService(), LANG);

const throwsError = async (task: () => unknown) => {
	try {
		await task();
	} catch (e) {
		return true;
	}
	return false;
};

const fields = [
	{name: "gatherings",
		fields: [
			{name: "units",
				fields: [
					{name: "identifications",
						fields: [
							{name: "taxon"},
							{name: "taxonVerbatim"},
							{name: "taxonID"},
						]},
					{name: "recordBasis",
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
	gatherings: { }
};

describe("fields", () => {
	describe("context", () => {
		it("is document by default", async () => {
			const form = {
				fields: [{ name: "gatherings" }]
			};
			expect(await throwsError(() => fieldService.masterToSchemaFormat(form, LANG))).toBe(false);
		});

		it("changes the root field and allows fields from that context", async () => {
			const form = {
				context: "namedPlace",
				fields: [{ name: "privateNotes" }]
			};
			expect(await throwsError(() => fieldService.masterToSchemaFormat(form, LANG))).toBe(false);
		});

		it("changes the root field and doesn't allow fields outside that context", async () => {
			const form = {
				context: "namedPlace",
				fields: [{ name: "gatherings" }]
			};
			expect(await throwsError(() => fieldService.masterToSchemaFormat(form, LANG))).toBe(true);
		});

		it("doesn't work with prefix", async () => {
			const form = {
				context: "MNP.namedPlace",
				fields: [{ name: "privateNotes" }]
			};
			expect(await throwsError(() => fieldService.masterToSchemaFormat(form, LANG))).toBe(true);
		});

		it("doesn't allow properties", async () => {
			const form = {
				context: "gatherings", // Not a class but property. "gathering" would be fine.
				fields: [{ name: "locality" }]
			};
			expect(await throwsError(() => fieldService.masterToSchemaFormat(form, LANG))).toBe(true);
		});

		it("works with embeddable range property even though it's not a class", async () => {
			const form = {
				context: "gathering",
				fields: [{ name: "locality" }]
			};
			expect(await throwsError(() => fieldService.masterToSchemaFormat(form, LANG))).toBe(false);
		});
	});


	it("doesn't allow field not in container field", async () => {
		const form = {
			fields: [{ name: "gatherings", fields: [{ name: "BADFIELD" }]}]
		};
		expect(await throwsError(() => fieldService.masterToSchemaFormat(form, LANG))).toBe(true);
	});

	it("doesn't work with prefix", async () => {
		const form = {
			fields: [{name: "MY.gatherings"}]
		};
		expect(await throwsError(() => fieldService.masterToSchemaFormat(form, LANG))).toBe(true);
	});

	it("doesn't work with prefix deeply", async () => {
		const form = {
			fields: [{ name: "MY.gatherings", fields: [{ name: "MY.locality" }]}]
		};
		expect(await throwsError(() => fieldService.masterToSchemaFormat(form, LANG))).toBe(true);
	});

	describe("field conversion", () => {
		describe("maps object for root", () => {
			const form = { fields: [] };

			it("for schema format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.schema.type).toBe("object");
				expect(schemaFormat.schema.properties).toEqual({});
			});

			it("for json format", async () => {
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
				expect(jsonFormat.fields).toEqual([]);
			});
		});

		describe("embeddable & unbounded maxOccurs -> array of objects with properties", () => {
			const form = { fields: [{ name: "gatherings", fields: [{ name: "locality" }]}] };

			it("for schema format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.schema.properties.gatherings.type).toBe("array");
				expect(schemaFormat.schema.properties.gatherings.items).not.toBe(undefined);
				expect(schemaFormat.schema.properties.gatherings.items.type).toBe("object");
				expect(schemaFormat.schema.properties.gatherings.items.properties.locality).not.toBe(undefined);
			});

			it("for json format", async () => {
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
				expect(jsonFormat.fields?.[0]?.type).toEqual("collection");
				expect(jsonFormat.fields?.[0]?.fields?.[0]).not.toBe(undefined);
			});
		});

		describe("embeddable & not unbounded maxOccurs -> object with properties", () => {
			const form = { fields: [{ name: "gatheringEvent", fields: [{ name: "leg" }]}] };

			it("for schema format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.schema.properties.gatheringEvent.properties.leg.type).toBe("array");
			});

			it("for json format", async () => {
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
				expect(jsonFormat.fields?.[0]?.type).toEqual("fieldset");
				expect(jsonFormat.fields?.[0]?.fields?.[0]?.type).toEqual("collection");
			});
		});

		describe("xsd:string ->  string", () => {
			const form = { fields: [{ name: "editor" }] };

			it("for schema format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.schema.properties.editor.type).toBe("string");
			});

			it("for json format", async () => {
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
				expect(jsonFormat.fields?.[0].type).toEqual("text");
			});
		});

		describe("xsd:string with unbounded maxOccurs -> array of strings", () => {
			const form = { fields: [{ name: "genbank" }] };

			it("for schema format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.schema.properties.genbank.type).toBe("array");
				expect(schemaFormat.schema.properties.genbank.items.type).toBe("string");
			});

			it("for json format", async () => {
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
				expect(jsonFormat.fields?.[0]?.type).toEqual("collection");
				expect(jsonFormat.fields?.[0]?.options?.target_element?.type).toEqual("text");
			});
		});

		describe("xsd:integer -> integer", () => {
			const form = { fields: [{ name: "gatherings", fields: [{ name: "observationDays" }] }] };

			it("for schema format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				const {observationDays} = schemaFormat.schema.properties.gatherings.items.properties;
				expect(observationDays.type).toBe("integer");
			});

			it("for json format", async () => {
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
				expect(jsonFormat.fields?.[0].fields?.[0].type).toEqual("integer");
			});
		});

		describe("xsd:nonNegativeInteger -> integer with minimum 0", () => {
			const form = { fields: [{ name: "gatherings", fields: [{ name: "relativeHumidity" }] }] };

			it("for schema format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);

				const {relativeHumidity} = schemaFormat.schema.properties.gatherings.items.properties;
				expect(relativeHumidity.type).toBe("integer");
				expect(relativeHumidity.minimum).toBe(0);
			});

			it("for json format", async () => {
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
				expect(jsonFormat.fields?.[0]?.fields?.[0]?.type).toEqual("integer:nonNegativeInteger");
			});
		});

		describe("xsd:positiveInteger -> integer with exclusiveMinimum 0", () => {
			const form = { fields: [{ name: "gatherings", fields: [{ name: "observationMinutes" }] }] };

			it("for schema format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				const {observationMinutes} = schemaFormat.schema.properties.gatherings.items.properties;
				expect(observationMinutes.type).toBe("integer");
				expect(observationMinutes.exclusiveMinimum).toBe(0);
			});

			it("for json format", async () => {
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
				expect(jsonFormat.fields?.[0].fields?.[0].type).toEqual("integer:positiveInteger");
			});
		});

		describe("decimal -> number", () => {
			const form = { fields: [{ name: "gatherings", fields: [{ name: "samplingAreaSizeInSquareMeters" }] }] };

			it("for schema format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				const {samplingAreaSizeInSquareMeters} = schemaFormat.schema.properties.gatherings.items.properties;
				expect(samplingAreaSizeInSquareMeters.type).toBe("number");
			});

			it("for json format", async () => {
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
				expect(jsonFormat.fields?.[0]?.fields?.[0]?.type).toEqual("number");
			});
		});

		describe("xsd:boolean -> boolean", () => {
			const form = { fields: [{ name: "isTemplate" }] };

			it("for schema format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);

				const {isTemplate} = schemaFormat.schema.properties;
				expect(isTemplate.type).toBe("boolean");
			});

			it("for json format", async () => {
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
				expect(jsonFormat.fields?.[0].type).toEqual("checkbox");
			});
		});

		describe("xsd:keyAny -> empty object", () => {
			const form = { fields: [{ name: "acknowledgedWarnings" }] };

			it("for schema format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				const acknowledgedWarnings = schemaFormat.schema.properties.acknowledgedWarnings.items;
				expect(acknowledgedWarnings.type).toBe("object");
				expect(acknowledgedWarnings.properties).toEqual({});
			});

			it("for json format", async () => {
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
				expect(jsonFormat.fields?.[0]?.options?.target_element?.type).toEqual("fieldset");
			});
		});

		describe("unknown field", () => {
			describe("with type text -> string", async () => {
				const form: Master = { fields: [{ name: "unknownField", type: "string" }] };

				it("for schema format", async () => {
					const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
					const {unknownField} = schemaFormat.schema.properties;
					expect(unknownField.type).toBe("string");
				});

				it("for json format", async () => {
					const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
					expect(jsonFormat.fields?.[0]?.type).toEqual("text");
				});
			});

			describe("with type checkbox -> boolean", async () => {
				const form: Master = { fields: [{ name: "unknownField", type: "checkbox" }] };

				it("for schema format", async () => {
					const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
					const {unknownField} = schemaFormat.schema.properties;
					expect(unknownField.type).toBe("boolean");
				});

				it("for json format", async () => {
					const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
					expect(jsonFormat.fields?.[0]?.type).toEqual("checkbox");
				});
			});
		});

		describe("geometry -> empty object", () => {
			const form = { fields: [{ name: "gatherings", fields: [{ name: "geometry" }] }] };

			it("for schema format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				const {geometry} = schemaFormat.schema.properties.gatherings.items.properties;
				expect(geometry.type).toBe("object");
				expect(geometry.properties).toEqual({});
			});

			it("for json format", async () => {
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
				expect(jsonFormat.fields?.[0].fields?.[0].type).toEqual("text");
			});
		});

		describe("alt range -> string enum range", () => {
			const form = { fields: [{ name: "secureLevel" }] };

			it("for schema format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				const {secureLevel}: any = schemaFormat.schema.properties;
				expect(secureLevel.type).toBe("string");
				expect(secureLevel.oneOf.length).toBe(10);
				expect(secureLevel.oneOf[0].const).toBe("");
				expect(secureLevel.oneOf[0].title).toBe("");
				expect(secureLevel.oneOf[1].const).toBe("MX.secureLevelNone");
				expect(secureLevel.oneOf[1].title).toBe("Ei karkeistettu");
			});

			it("for schema-with-enum format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaWithEnumsFormat(form, LANG);
				const {secureLevel}: any = schemaFormat.schema.properties;
				expect(secureLevel.type).toBe("string");
				expect(secureLevel.enum.length).toBe(10);
				expect(secureLevel.enumNames.length).toBe(10);
				expect(secureLevel.enum[0]).toBe("");
				expect(secureLevel.enumNames[0]).toBe("");
				expect(secureLevel.enum[1]).toBe("MX.secureLevelNone");
				expect(secureLevel.enumNames[1]).toBe("Ei karkeistettu");
			});

			it("for json format", async () => {
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
				expect(jsonFormat.fields?.[0]?.type).toEqual("select");
				expect(jsonFormat.fields?.[0]?.options?.value_options?.[""]).toEqual("");
				expect(Object.keys(jsonFormat.fields?.[0]?.options?.value_options || {}).length).toEqual(10);
			});
		});

		describe("alt range with whitelist -> string enum range whitelisted", () => {
			let form: Master;
			beforeAll(async () => {
				form = { fields: [{ name: "secureLevel", options: {whitelist: ["MX.secureLevelKM5", "foo"]} }] };
			});

			it("for schema format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				const {secureLevel}: any = schemaFormat.schema.properties;
				expect(secureLevel.oneOf).toEqual([{const: "MX.secureLevelKM5", title: "5 km"}]);
			});

			it("for schema-with-enums format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaWithEnumsFormat(form, LANG);
				const {secureLevel}: any = schemaFormat.schema.properties;
				expect(secureLevel.enum).toEqual(["MX.secureLevelKM5"]);
				expect(secureLevel.enumNames).toEqual(["5 km"]);
			});

			it("for json format", async () => {
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
				expect(jsonFormat.fields?.[0]?.options?.value_options?.["MX.secureLevelKM5"]).toEqual("5 km");
			});
		});

		describe("alt range with blacklist -> string enum range blacklisted", () => {
			const form = { fields: [{ name: "secureLevel", options: {blacklist: ["MX.secureLevelKM5", "foo", ""]} }] };

			it("for schema format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				const {secureLevel}: any = schemaFormat.schema.properties;
				expect(secureLevel.oneOf.length).toBe(8);
			});

			it("for schema-with-enums format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaWithEnumsFormat(form, LANG);
				const {secureLevel}: any = schemaFormat.schema.properties;
				expect(secureLevel.enum.length).toBe(8);
				expect(secureLevel.enumNames.length).toBe(8);
			});

			it("for json format", async () => {
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
				expect(Object.keys(jsonFormat.fields?.[0]?.options?.value_options || {}).length).toBe(8);
			});
		});

		describe("multiLanguage", async () => {
			const form = { context: "dataset", fields: [{ name: "datasetName" }] };
			let jsonFormat: SchemaFormat;

			beforeAll(async () => {
				jsonFormat = await fieldService.masterToSchemaFormat(form, LANG);
			});

			it("is converted into lang object in schema", async () => {
				const datasetSchema = (jsonFormat.schema as JSONSchemaObject).properties.datasetName;
				expect((datasetSchema as JSONSchemaObject).properties).toEqual({
					fi: {type: "string"},
					sv: {type: "string"},
					en: {type: "string"}
				});
			});

			it("gets 'ui:multiLanguage' property in uiSchema", async () => {
				expect(jsonFormat.uiSchema.datasetName["ui:multiLanguage"]).toBe(true);
			});
		});

		describe("gathers required properties", () => {
			const form = { fields: [{ name: "gatherings" }, { name: "secureLevel" } ] };

			it("for schema format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.schema.required).toEqual(["gatherings"]);
			});

			it("for json format", async () => {
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
				expect(jsonFormat.fields?.[0]?.required).toBe(undefined);
			});
		});

		describe("default populated", () => {
			const form = { fields: [ { name: "secureLevel", options: { default: "secureLevelKM5" }} ]};

			it("for schema format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.schema.properties.secureLevel.default).toBe("secureLevelKM5");
			});

			it("for json format", async () => {
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
				expect(jsonFormat.fields?.[0]?.options?.default).toBe("secureLevelKM5");
			});
		});

		describe("option", () => {
			describe("excludeFromCopy", () => {

				let schemaFormat: SchemaFormat;
				beforeAll(async () => {
					const form = { fields: [
						{ name: "gatherings", options: { excludeFromCopy: true },
							fields: [ { name: "units", options: { excludeFromCopy: true }, fields: [
								{name: "unitGathering", fields: [
									{name: "dateEnd", options: {excludeFromCopy: true }}
								]}
							]}]
						}
					]};
					schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
				});

				it("populated to root excludeFromCopy list", async () => {
					expect(schemaFormat.excludeFromCopy).toEqual([
						"$.gatherings",
						"$.gatherings[*].units",
						"$.gatherings[*].units[*].unitGathering.dateEnd",
					]);
				});
			});

			describe("value_options are used", () => {
				const value_options = {a: "aLabel", b: "bLabel"};
				const form = { fields: [
					{ name: "gatherings",
						fields: [ { name: "coordinateSource", options: { value_options }} ]
					}
				]};

				it("for schema format", async () => {
					const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
					const {coordinateSource} = schemaFormat.schema.properties.gatherings.items.properties;
					expect(coordinateSource.oneOf).toEqual([
						{const: "a", title: "aLabel"},
						{const: "b", title: "bLabel"}
					]);
				});

				it("for schema-with-enums format", async () => {
					const schemaFormat: any = await fieldService.masterToSchemaWithEnumsFormat(form, LANG);
					const {coordinateSource} = schemaFormat.schema.properties.gatherings.items.properties;
					expect(coordinateSource.enum).toEqual(["a", "b"]);
					expect(coordinateSource.enumNames).toEqual(["aLabel", "bLabel"]);
				});

				it("for json format", async () => {
					const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
					expect(jsonFormat.fields?.[0]?.fields?.[0]?.options?.value_options).toEqual(value_options);
				});
			});

			describe("value_options add uniqueItems if array", () => {
				it("for schema format", async () => {
					const form = { fields: [
						{ name: "gatherings",
							fields: [ { name: "batHabitat", options: { value_options: {a: "aLabel", b: "bLabel"} }} ]
						}
					]};
					const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
					const batHabitat = schemaFormat.schema.properties.gatherings.items.properties.batHabitat;
					expect(batHabitat.items.oneOf).toEqual([
						{const: "a", title: "aLabel"},
						{const: "b", title: "bLabel"}
					]);
					expect(batHabitat.uniqueItems).toEqual(true);
				});

				it("for schema-with-enums format", async () => {
					const form = { fields: [
						{ name: "gatherings",
							fields: [ { name: "batHabitat", options: { value_options: {a: "aLabel", b: "bLabel"} }} ]
						}
					]};
					const schemaFormat: any = await fieldService.masterToSchemaWithEnumsFormat(form, LANG);
					const batHabitat = schemaFormat.schema.properties.gatherings.items.properties.batHabitat;
					expect(batHabitat.items.enum).toEqual(["a", "b"]);
					expect(batHabitat.items.enumNames).toEqual(["aLabel", "bLabel"]);
					expect(batHabitat.uniqueItems).toEqual(true);
				});
			});

			it("whitelist works", () => {
				const form = { fields: [
					{ name: "secureLevel", options: { whitelist: ["", "MX.secureLevelKM5"] } },
				]};

				it("for schema format", async () => {
					const schemaFormat: any = await fieldService.masterToSchemaWithEnumsFormat(form, LANG);
					expect(schemaFormat.schema.properties.secureLevel.oneOf).toEqual([
						{const: "", title:  ""},
						{const: "MX.secureLevelKM5", title: "5 km"}
					]);
				});

				it("for schema-with-enums format", async () => {
					const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
					expect(schemaFormat.schema.properties.secureLevel.enum).toEqual(["", "MX.secureLevelKM5"]);
					expect(schemaFormat.schema.properties.secureLevel.enumNames).toEqual(["", "5 km"]);
				});

				it("for json format", async () => {
					const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
					expect(jsonFormat.fields?.[0]?.fields?.[0]?.options?.value_options).toEqual({
						"": "",
						"MX.secureLevelKM5": "5 km"
					});
				});
			});

			describe("whitelist doesn't care about nonexisting value", () => {
				const form = { fields: [
					{ name: "secureLevel", options: { whitelist: ["", "foo"] } },
				]};

				it("for schema format", async () => {
					const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
					expect(schemaFormat.schema.properties.secureLevel.oneOf).toEqual([
						{const: "", title:  ""}
					]);
				});

				it("for schema-with-enums format", async () => {
					const schemaFormat: any = await fieldService.masterToSchemaWithEnumsFormat(form, LANG);
					expect(schemaFormat.schema.properties.secureLevel.enum).toEqual([""]);
					expect(schemaFormat.schema.properties.secureLevel.enumNames).toEqual([""]);
				});

				it("for json format", async () => {
					const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
					expect(jsonFormat.fields?.[0]?.options?.value_options).toEqual({ "": "" });
				});
			});

			describe("blacklist works", () => {
				const form = { fields: [
					{ name: "secureLevel", options: { blacklist: [
						"", "MX.secureLevelNone", "MX.secureLevelKM5", "MX.secureLevelKM10", "MX.secureLevelKM50",
						"MX.secureLevelKM100", "MX.secureLevelKM500", "MX.secureLevelHighest", "MX.secureLevelNoShow"
					] }},
				]};

				it("for schema format", async () => {
					const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
					expect(schemaFormat.schema.properties.secureLevel.oneOf).toEqual([
						{const: "MX.secureLevelKM1", title:  "1 km"},
						{const: "MX.secureLevelKM25", title: "25 km"}
					]);
				});

				it("for schema-with-enums format", async () => {
					const schemaFormat: any = await fieldService.masterToSchemaWithEnumsFormat(form, LANG);
					const {secureLevel}: any = schemaFormat.schema.properties;
					expect(secureLevel.enum).toEqual(["MX.secureLevelKM1", "MX.secureLevelKM25"]);
					expect(secureLevel.enumNames).toEqual(["1 km", "25 km"]);
				});

				it("for json format", async () => {
					const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
					expect(jsonFormat.fields?.[0]?.options?.value_options).toEqual({
						"MX.secureLevelKM1": "1 km",
						"MX.secureLevelKM25": "25 km"
					});
				});
			});

			describe("blacklist doesn't care about nonexisting value", () => {
				const form = { fields: [
					{ name: "secureLevel", options: {blacklist: ["", "foo"]} },
				]};

				it("for schema format", async () => {
					expect(await throwsError(() => fieldService.masterToSchemaFormat(form, LANG))).toBe(false);
				});

				it("for schema-with-enums format", async () => {
					expect(await throwsError(() => fieldService.masterToSchemaWithEnumsFormat(form, LANG)))
						.toBe(false);
				});

				it("for json format", async () => {
					expect(await throwsError(() => fieldService.masterToExpandedJSONFormat(form, LANG))).toBe(false);
				});
			});

			describe("uniqueItems works", () => {
				const form = { fields: [
					{ name: "secureLevel", options: { uniqueItems: true } },
				]};

				it("for schema format", async () => {
					const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
					expect(schemaFormat.schema.properties.secureLevel.uniqueItems).toEqual(true);
				});

				it("for json format", async () => {
					const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
					expect(jsonFormat.fields?.[0]?.options?.uniqueItems).toBe(true);
				});
			});

			describe("maxItems works", () => {
				const form = { fields: [
					{ name: "gatherings", options: { maxItems: 3 } },
				]};

				it("for schema format", async () => {
					const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
					expect(schemaFormat.schema.properties.gatherings.maxItems).toEqual(3);
				});

				it("for json format", async () => {
					const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
					expect(jsonFormat.fields?.[0]?.options?.maxItems).toBe(3);
				});
			});

			describe("minItems works", () => {
				const form = { fields: [
					{ name: "gatherings", options: { minItems: 3 } },
				]};

				it("for schema format", async () => {
					const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
					expect(schemaFormat.schema.properties.gatherings.minItems).toEqual(3);
				});

				it("for json format", async () => {
					const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
					expect(jsonFormat.fields?.[0]?.options?.minItems).toBe(3);
				});
			});
		});

		describe("hidden works", () => {
			const form = { fields: [
				{ name: "secureLevel", type: "hidden" as any },
			]};

			it("for schema format", async () => {
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				const {secureLevel}: any = schemaFormat.schema.properties;
				expect(secureLevel.enum).toBe(undefined);
				expect(secureLevel.enumNames).toBe(undefined);
			});

			it("for json format", async () => {
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form, LANG);
				expect(jsonFormat.fields?.[0]?.options?.value_options).toBe(undefined);
				expect(jsonFormat.fields?.[0]?.type).toBe("hidden");
			});
		});

		describe("label", () => {
			describe("for schema format", () => {
				it("not populated for root", async () => {
					const form = { fields: [ { name: "gatherings" } ]};
					const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
					expect(schemaFormat.schema.title).toBe(undefined);
				});

				it("populated from property metadata", async () => {
					const form = { fields: [ { name: "gatherings" } ]};
					const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
					expect(schemaFormat.schema.properties.gatherings.title).toBe("Keruutapahtumat");
				});

				it("can be overridden", async () => {
					const form = { fields: [ { name: "gatherings", label: "foo" } ]};
					const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
					expect(schemaFormat.schema.properties.gatherings.title).toBe("foo");
				});

				it("can be overridden with empty", async () => {
					const form = { fields: [ { name: "gatherings", label: "" } ]};
					const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
					expect(schemaFormat.schema.properties.gatherings.title).toBe("");
				});
			});

			it("for json format", async () => {
				const form = { fields: [ { name: "gatherings" } ]};
				const jsonFormat = await fieldService.masterToExpandedJSONFormat(form);
				expect(jsonFormat.fields?.[0]?.label).toBe("@gatherings");
				expect(jsonFormat.translations?.fi?.["@gatherings"]).toBe("Keruutapahtumat");
			});
		});
	});

	describe("validators", () => {
		it("empty object for undefined", async () => {
			const form = {};
			const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
			expect(schemaFormat.validators).toEqual({});
			expect(schemaFormat.warnings).toEqual({});
		});

		it("populates validator and warnings", async () => {
			const form = { fields: [ { name: "gatherings", validators: { presence: true }, fields: [
				{ name: "units", validators: { presence: true }, warnings: { presence: true } }
			]} ]};
			const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
			expect(schemaFormat.validators.gatherings.presence).toBe(true);
			expect(schemaFormat.validators.gatherings.items.properties.units.presence).toBe(true);
			expect(schemaFormat.warnings.gatherings.items.properties.units.presence).toBe(true);
		});

		describe("default geometry validator", () => {
			it("is added", async () => {
				const form = { fields: [ { name: "gatheringEvent", fields: [ { name: "geometry" } ]} ]};
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.validators.gatheringEvent.properties.geometry.geometry.maximumSize).toBeTruthy();
				expect(schemaFormat.validators.gatheringEvent.properties.geometry.geometry.message.missingGeometries)
					.toBe("Täytyy olla vähintään yksi kuvio.");
			});

			it("is added for all geometries in schema", async () => {
				const form = { fields: [
					{ name: "gatheringEvent", fields: [ { name: "geometry" } ] },
					{ name: "gatherings", fields: [
						{name: "units", fields: [ { name: "unitGathering", fields: [ { name: "geometry" } ] } ] }
					]}
				]};
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.validators.gatheringEvent.properties.geometry.geometry.message.missingGeometries)
					.toBe("Täytyy olla vähintään yksi kuvio.");
				expect(schemaFormat.validators.gatherings.items.properties
					.units.items.properties.unitGathering.properties.geometry.geometry.message.missingGeometries)
					.toBe("Täytyy olla vähintään yksi kuvio.");
			});

			it("messages can be overridden", async () => {
				const form = { fields: [ { name: "gatheringEvent", fields: [ { name: "geometry" } ]} ],
					translations: {
						[LANG]: {
							"@geometryValidationAtLeastOne": "foo"
						}
					}
				};
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.validators.gatheringEvent.properties.geometry.geometry.maximumSize).toBeTruthy();
				expect(schemaFormat.validators.gatheringEvent.properties.geometry.geometry.message.missingGeometries)
					.toBe("foo");
			});


			it("can be removed with false", async () => {
				const form = { fields: [ { name: "gatherings", fields: [
					{ name: "geometry", validators: { geometry: false } }
				]} ]};
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.validators).toEqual({});
			});
		});

		describe("default gatherings geometry validator", () => {
			it("overrides the default geometry validator", async () => {
				const form = { fields: [ { name: "gatherings", fields: [ { name: "geometry" } ]}]};
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				const {geometry} = schemaFormat.validators.gatherings.items.properties;
				expect(geometry.geometry.requireShape).toBe(true);
			});

			it("overriding overrides completely", async () => {
				const form = { fields: [ { name: "gatherings", fields: [
					{ name: "geometry", validators: { geometry: { foo: "bar" }} }
				]}]};
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				const {geometry} = schemaFormat.validators.gatherings.items.properties;
				expect(geometry.geometry.requireShape).toBe(undefined);
				expect(geometry.geometry.foo).toBe("bar");
			});

			it("message overrides default geometry validator message", async () => {
				const form = { fields: [
					{ name: "gatherings", fields: [ { name: "geometry" } ]}
				]};
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.validators.gatherings.items.properties.geometry.geometry.message.missingGeometries)
					.toBe("Paikalla täytyy olla vähintään yksi kuvio.");
			});
		});

		describe("default dateBegin/dateEnd validator", () => {
			it("is added", async () => {
				const form = { fields: [ { name: "gatheringEvent", fields: [
					{ name: "dateBegin" }, { name: "dateEnd" }
				]} ]};
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				["dateBegin", "dateEnd"].forEach(field => {
					const {datetime} = schemaFormat.validators.gatheringEvent.properties[field];
					expect(datetime.earliest).toBe("1000-01-01");
				});
			});

			it("messages can be overridden", async () => {
				const form = {
					fields: [ { name: "gatheringEvent", fields: [
						{ name: "dateBegin" }, { name: "dateEnd" }
					]} ],
					translations: {
						[LANG]: {
							"@dateTooEarlyValidation": "foo"
						}
					}
				};
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				["dateBegin", "dateEnd"].forEach(field => {
					expect(schemaFormat.validators.gatheringEvent.properties[field].datetime.tooEarly).toBe("foo");
				});
			});

			it("merged to existing validators", async () => {
				const validators = {
					datetime: {
						latest: "should be kept",
						earliest: "should replace the default validator"
					}
				};
				const form = { fields: [ { name: "gatheringEvent", fields: [
					{ name: "dateBegin", validators }, { name: "dateEnd", validators }
				]} ]};
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				["dateBegin", "dateEnd"].forEach(field => {
					const {datetime} = schemaFormat.validators.gatheringEvent.properties[field];
					expect(datetime.latest).toBe("should be kept");
					expect(datetime.earliest)
						.toBe("should replace the default validator");
				});
			});

			it("can be removed with false", async () => {
				const form = { fields: [ { name: "gatheringEvent", fields: [
					{ name: "dateBegin", validators: { datetime: false } },
					{ name: "dateEnd", validators: { datetime: false } }
				]} ]};
				const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.validators).toEqual({});
			});
		});
	});
});

describe("extra", () => {
	it("undefined if no fields with alt parents", async () => {
		const form = { fields: [ { name: "gatherings" } ]};
		const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
		expect(schemaFormat.extra).toBe(undefined);
	});

	it("populated from field with alt parents", async () => {
		const form = { fields: [ { name: "gatherings", fields: [ { name: "habitat" } ]} ]};
		const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
		const extra = schemaFormat.extra as any;
		expect(extra.habitat.altParent["MY.habitatEnumValue1"]).toEqual([]);
		expect(extra.habitat.altParent["MY.habitatEnumValue2"]).toEqual(["MY.habitatEnumValue1"]);
	});
});

describe("uiSchemaContext", () => {
	it("undefined if no fields with alt parents", async () => {
		const form = { fields: [ { name: "gatherings" } ]};
		const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
		expect(schemaFormat.uiSchemaContext).toBe(undefined);
	});

	it("populated from field with alt parents", async () => {
		const form = { fields: [ { name: "gatherings", fields: [ { name: "habitat" } ]} ]};
		const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
		const node = (schemaFormat.uiSchemaContext as any).habitat.tree
			.children["MY.habitatEnumValue1"].children["MY.habitatEnumValue2"];
		expect(node.children).toEqual({
			"MY.habitatEnumValue3": {},
			"MY.habitatEnumValue4": {},
			"MY.habitatEnumValue5": {},
			"MY.habitatEnumValue6": {}
		});
		expect(node.order).toEqual([
			"MY.habitatEnumValue3",
			"MY.habitatEnumValue4",
			"MY.habitatEnumValue5",
			"MY.habitatEnumValue6"
		]);
	});
});

describe("language", () => {
	it("not added if not asked for", async () => {
		const form = { };
		const schemaFormat: any = await fieldService.masterToSchemaFormat(form);
		expect(schemaFormat.language).toBe(undefined);
	});

	it("added if asked for", async () => {
		const form = { };
		const schemaFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
		expect(schemaFormat.language).toBe(LANG);
	});
});

describe("prepopulatedDocument population", () => {

	let schemaFormat: SchemaFormat;
	beforeAll(async () => {
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
		schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
	});

	it("merges prepopulatedDocument and prepopulateWithInformalTaxonGroups", async () => {
		expect(schemaFormat.options.prepopulatedDocument.gatherings.length).toBe(1);
		const gathering = schemaFormat.options.prepopulatedDocument.gatherings[0];
		expect(gathering.units[0].notes).toBe("foo");
		expect(gathering.units[0].identifications[0].taxon).toBeTruthy();
	});

	it("populates with defaults", async () => {
		schemaFormat.options.prepopulatedDocument.gatherings[0].units.forEach((unit: any) => {
			expect(unit.recordBasis).toBe("MY.recordBasisHumanObservation");
		});
	});

	it("prepopulateWithInformalTaxonGroups fills taxon data", async () => {
		expect(schemaFormat.options.prepopulatedDocument.gatherings[0].units.length).toBeGreaterThan(1);
		const identification = schemaFormat.options.prepopulatedDocument.gatherings[0].units[0].identifications[0];
		expect(identification.taxon).toBe("Parnassius apollo");
		expect(identification.taxonID).toBe("MX.60724");
		expect(identification.taxonVerbatim).toBe("isoapollo");
	});
});

describe("translations", () => {
	it("doesn't crash when not present and is undefined", async () => {
		const form = { };
		const schemaFormat: any = await fieldService.masterToSchemaFormat(form);
		expect(schemaFormat.translations).toBe(undefined);
	});

	it("included when asked without lang", async () => {
		const form = { translations: {fi: {}, en: {}}};
		const schemaFormat: any = await fieldService.masterToSchemaFormat(form);
		expect(schemaFormat.translations).toEqual({fi: {}, en: {}});
	});

	const form = { translations: { fi: {"@key": "foo"}, en: {"@key": "bar"} }, uiSchema: {"test": "@key"} };

	it("not included when asked with lang and is translated", async () => {
		const fi = await fieldService.masterToSchemaFormat(form, "fi");
		expect(fi.translations).toBe(undefined);
		expect(fi.uiSchema.test).toBe("foo");

		const en = await fieldService.masterToSchemaFormat(form, "en");
		expect(en.translations).toBe(undefined);
		expect(en.uiSchema.test).toBe("bar");
	});

	it("key not translated if lang not in translations", async () => {
		const sv = await fieldService.masterToSchemaFormat(form, "sv");
		expect(sv.translations).toBe(undefined);
		expect(sv.uiSchema.test).toBe("@key");
	});
});

describe("patching", () => {
	const patch = [
		{
			op: "add",
			path: "/fields/0/fields/-",
			value: {
				name: "municipality",
				label: "foo"
			}
		},
		{
			op: "add",
			path: "/fields/0/fields/-",
			value: {
				"name": "locality",
				label: "bar"
			}
		}
	];

	it("done against master format", async () => {
		const form = {
			fields,
			uiSchema,
			patch: [patch[0]]
		};
		const jsonFormat: any = await fieldService.masterToSchemaFormat(form, LANG);
		expect(jsonFormat.schema.properties.gatherings.items.properties.municipality.title).toBe("foo");
	});

	it("works with multiple on same target", async () => {
		const form = {
			fields,
			uiSchema,
			patch
		};

		const jsonFormat: any = await fieldService.masterToSchemaFormat(form, LANG);

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
						name: "municipality",
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

		const jsonFormat: any = await fieldService.masterToSchemaFormat(form, LANG);

		expect(jsonFormat.schema.properties.gatherings.items.properties.municipality.title).toBe("foo");
		expect(jsonFormat.uiSchema.municipality).toBe("foo");
	});

	it("doesn't allow invalid", async () => {
		const form = {
			fields,
			uiSchema,
			patch: [{"op": "add", "path": "/foo/bar", value: "foo"}]
		};

		expect(await throwsError(() => fieldService.masterToSchemaFormat(form, LANG))).toBe(true);
	});
});

describe("taxonSets", () => {
	it("works for single", async() => {
		const form = {
			uiSchema: {test: "...taxonSet:MX.taxonSetSykeBumblebee"}
		};

		const jsonFormat = await fieldService.masterToSchemaFormat(form, LANG);
		expect(jsonFormat.uiSchema.test.length).toBe(38);
		expect(jsonFormat.uiSchema.test[0]).toBe("MX.204772");
	});

	it("works for multiple", async() => {
		const form = {
			uiSchema: {test: "...taxonSet:MX.taxonSetSykeBumblebee,MX.taxonSetSykeBumblebeeOther"}
		};

		const jsonFormat = await fieldService.masterToSchemaFormat(form, LANG);
		expect(jsonFormat.uiSchema.test.length).toBe(38 + 9);
		expect(jsonFormat.uiSchema.test[38]).toBe("MX.53474");
	});
});

describe("options", () => {
	describe("always defined", () => {
		it("for schema format", async () => {
			const schemaFormat: any = await fieldService.masterToSchemaFormat({}, LANG);
			expect(schemaFormat.options).toEqual({});
		});

		it("for json format", async () => {
			const jsonFormat = await fieldService.masterToExpandedJSONFormat({}, LANG);
			expect(jsonFormat.options).toEqual({});
		});
	});
});
