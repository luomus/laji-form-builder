import ApiClient from "laji-form/lib/ApiClient";
import ApiClientImplementation from "../../src/server/view/ApiClientImplementation";
import config from "../../config.json";
import FieldService from "../../src/server/services/field-service";
import MetadataService from "../../src/services/metadata-service";
import { SchemaFormat, Field } from "../../src/model";

const LANG = "fi";
const mock = !(process.env.MOCK === "false");

class MockApiClientImplementation extends ApiClientImplementation {
	mock(path: string, query?: any, options?: any): Response | undefined {
		if (options.method) {
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

const apiClientImpl = (...args: ConstructorParameters<typeof ApiClientImplementation>) => mock
	? new MockApiClientImplementation(...args)
	: new ApiClientImplementation(...args);

const apiClient = new ApiClient(apiClientImpl(
	config.apiBase,
	config.accessToken,
	config.userToken,
	LANG
), LANG, {fi: {}, sv: {}, en: {}});

const fieldService = new FieldService(apiClient, new MetadataService(apiClient, LANG), LANG);

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
				context: "gatherings", // Not a class but property. "MY.gathering" would be fine.
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

	describe("schema", () => {
		it("maps object for root", async () => {
			const form = {
				fields: []
			};
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			expect(schemaFormat.schema.type).toBe("object");
			expect(schemaFormat.schema.properties).toEqual({});
		});

		it("embeddable & unbounded maxOccurs -> array of objects with properties", async () => {
			const form = {
				fields: [{ name: "gatherings", fields: [{ name: "locality" }]}]
			};
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			expect(schemaFormat.schema.properties.gatherings.type).toBe("array");
			expect(schemaFormat.schema.properties.gatherings.items).not.toBe(undefined);
			expect(schemaFormat.schema.properties.gatherings.items.type).toBe("object");
			expect(schemaFormat.schema.properties.gatherings.items.properties.locality).not.toBe(undefined);
		});

		it("embeddable & not unbounded maxOccurs -> object with properties", async () => {
			const form = {
				fields: [{ name: "gatheringEvent", fields: [{ name: "leg" }]}]
			};
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			expect(schemaFormat.schema.properties.gatheringEvent.properties.leg.type).toBe("array");
		});

		it("xsd:string ->  string", async () => {
			const form = { fields: [{ name: "editor" }] };
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			expect(schemaFormat.schema.properties.editor.type).toBe("string");
		});

		it("xsd:string with unbounded maxOccurs -> array of strings", async () => {
			const form = { fields: [{ name: "genbank" }] };
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			expect(schemaFormat.schema.properties.genbank.type).toBe("array");
			expect(schemaFormat.schema.properties.genbank.items.type).toBe("string");
		});

		it("xsd:integer -> integer", async () => {
			const form = { fields: [{ name: "gatherings", fields: [{ name: "observationDays" }] }] };
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			const {observationDays} = schemaFormat.schema.properties.gatherings.items.properties;
			expect(observationDays.type).toBe("integer");
		});

		it("xsd:nonNegativeInteger -> integer with minimum 0", async () => {
			const form = { fields: [{ name: "gatherings", fields: [{ name: "relativeHumidity" }] }] };
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			const {relativeHumidity} = schemaFormat.schema.properties.gatherings.items.properties;
			expect(relativeHumidity.type).toBe("integer");
			expect(relativeHumidity.minimum).toBe(0);
		});

		it("xsd:positiveInteger -> integer with exclusiveMinimum 0", async () => {
			const form = { fields: [{ name: "gatherings", fields: [{ name: "observationMinutes" }] }] };
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			const {observationMinutes} = schemaFormat.schema.properties.gatherings.items.properties;
			expect(observationMinutes.type).toBe("integer");
			expect(observationMinutes.exclusiveMinimum).toBe(0);
		});

		it("decimal -> number", async () => {
			const form = { fields: [{ name: "gatherings", fields: [{ name: "samplingAreaSizeInSquareMeters" }] }] };
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			const {samplingAreaSizeInSquareMeters} = schemaFormat.schema.properties.gatherings.items.properties;
			expect(samplingAreaSizeInSquareMeters.type).toBe("number");
		});

		it("xsd:boolean -> boolean", async () => {
			const form = { fields: [{ name: "isTemplate" }] };
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			const {isTemplate} = schemaFormat.schema.properties;
			expect(isTemplate.type).toBe("boolean");
		});

		it("xsd:keyAny -> empty object", async () => {
			const form = { fields: [{ name: "acknowledgedWarnings" }] };
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			const acknowledgedWarnings = schemaFormat.schema.properties.acknowledgedWarnings.items;
			expect(acknowledgedWarnings.type).toBe("object");
			expect(acknowledgedWarnings.properties).toEqual({});
		});

		it("geometry -> empty object", async () => {
			const form = { fields: [{ name: "gatherings", fields: [{ name: "geometry" }] }] };
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			const {geometry} = schemaFormat.schema.properties.gatherings.items.properties;
			expect(geometry.type).toBe("object");
			expect(geometry.properties).toEqual({});
		});

		it("alt range -> string enum range", async () => {
			const form = { fields: [{ name: "secureLevel" }] };
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			const {secureLevel} = schemaFormat.schema.properties;
			expect(secureLevel.type).toBe("string");
			expect(secureLevel.enum.length).toBe(10);
			expect(secureLevel.enumNames.length).toBe(10);
			expect(secureLevel.enum[0]).toBe("");
			expect(secureLevel.enumNames[0]).toBe("");
			expect(secureLevel.enum[1]).toBe("MX.secureLevelNone");
			expect(secureLevel.enumNames[1]).toBe("Ei karkeistettu");
		});

		it("alt range with whitelist -> string enum range whitelisted", async () => {
			const form = { fields: [{ name: "secureLevel", options: {whitelist: ["MX.secureLevelKM5", "foo"]} }] };
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			const {secureLevel} = schemaFormat.schema.properties;
			expect(secureLevel.enum).toEqual(["MX.secureLevelKM5"]);
			expect(secureLevel.enumNames).toEqual(["5 km"]);
		});

		it("alt range with blacklist -> string enum range blacklisted", async () => {
			const form = { fields: [{ name: "secureLevel", options: {blacklist: ["MX.secureLevelKM5", "foo", ""]} }] };
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			const {secureLevel} = schemaFormat.schema.properties;
			expect(secureLevel.enum.length).toBe(8);
			expect(secureLevel.enumNames.length).toBe(8);
		});

		it("gathers required properties", async () => {
			const form = { fields: [{ name: "gatherings" }, { name: "secureLevel" } ] };
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			expect(schemaFormat.schema.required).toEqual(["gatherings"]);
		});

		it("default populated", async () => {
			const form = { fields: [ { name: "secureLevel", options: { default: "secureLevelKM5" }} ]};
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			expect(schemaFormat.schema.properties.secureLevel.default).toBe("secureLevelKM5");
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

				it("populated to schema", async () => {
					const {units} = schemaFormat.schema.properties.gatherings.items.properties;
					expect(schemaFormat.schema.properties.gatherings.excludeFromCopy).toBe(true);
					expect(units.excludeFromCopy).toBe(true);
					expect(units.items.properties.unitGatheringexcludeFromCopy).toBe(undefined);
					expect(units.items.properties.unitGathering.properties.dateEnd.excludeFromCopy).toBe(true);
				});

				it("populated to root excludeFromCopy list", async () => {
					expect(schemaFormat.excludeFromCopy).toEqual([
						"$.gatherings",
						"$.gatherings[*].units",
						"$.gatherings[*].units[*].unitGathering.dateEnd",
					]);
				});
			});
			it("value_options are used", async () => {
				const form = { fields: [
					{ name: "gatherings",
						fields: [ { name: "coordinateSource", options: { value_options: {a: "aLabel", b: "bLabel"} }} ]
					}
				]};
				const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
				const coordinateSource = schemaFormat.schema.properties.gatherings.items.properties.coordinateSource;
				expect(coordinateSource.enum).toEqual(["a", "b"]);
				expect(coordinateSource.enumNames).toEqual(["aLabel", "bLabel"]);
			});

			it("value_options add uniqueItems if array", async () => {
				const form = { fields: [
					{ name: "gatherings",
						fields: [ { name: "batHabitat", options: { value_options: {a: "aLabel", b: "bLabel"} }} ]
					}
				]};
				const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
				const batHabitat = schemaFormat.schema.properties.gatherings.items.properties.batHabitat;
				expect(batHabitat.items.enum).toEqual(["a", "b"]);
				expect(batHabitat.items.enumNames).toEqual(["aLabel", "bLabel"]);
				expect(batHabitat.uniqueItems).toEqual(true);
			});

			it("whitelist works", async () => {
				const form = { fields: [
					{ name: "secureLevel", options: { whitelist: ["", "MX.secureLevelKM5"] } },
				]};
				const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.schema.properties.secureLevel.enum).toEqual(["", "MX.secureLevelKM5"]);
				expect(schemaFormat.schema.properties.secureLevel.enumNames).toEqual(["", "5 km"]);
			});

			it("whitelist doesn't care about nonexisting value", async () => {
				const form = { fields: [
					{ name: "secureLevel", options: { whitelist: ["", "foo"] } },
				]};
				const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.schema.properties.secureLevel.enum).toEqual([""]);
				expect(schemaFormat.schema.properties.secureLevel.enumNames).toEqual([""]);
			});

			it("blacklist works", async () => {
				const form = { fields: [
					{ name: "secureLevel", options: { blacklist: [
						"", "MX.secureLevelNone", "MX.secureLevelKM5", "MX.secureLevelKM10", "MX.secureLevelKM50",
						"MX.secureLevelKM100", "MX.secureLevelKM500", "MX.secureLevelHighest", "MX.secureLevelNoShow"
					] }},
				]};
				const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
				const {secureLevel} = schemaFormat.schema.properties;
				expect(secureLevel.enum).toEqual(["MX.secureLevelKM1", "MX.secureLevelKM25"]);
				expect(secureLevel.enumNames).toEqual(["1 km", "25 km"]);
			});

			it("blacklist doesn't care about nonexisting value", async () => {
				const form = { fields: [
					{ name: "secureLevel", options: {blacklist: ["", "foo"]} },
				]};
				expect(await throwsError(() => fieldService.masterToSchemaFormat(form, LANG))).toBe(false);
			});

			it("uniqueItems works", async () => {
				const form = { fields: [
					{ name: "secureLevel", options: { uniqueItems: true } },
				]};
				const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.schema.properties.secureLevel.uniqueItems).toEqual(true);
			});

			it("maxItems works", async () => {
				const form = { fields: [
					{ name: "gatherings", options: { maxItems: 3 } },
				]};
				const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.schema.properties.gatherings.maxItems).toEqual(3);
			});

			it("minItems works", async () => {
				const form = { fields: [
					{ name: "gatherings", options: { minItems: 3 } },
				]};
				const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.schema.properties.gatherings.minItems).toEqual(3);
			});
		});

		it("hidden works", async () => {
			const form = { fields: [
				{ name: "secureLevel", type: "hidden" as Field["type"]},
			]};
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			const {secureLevel} = schemaFormat.schema.properties;
			expect(secureLevel.enum).toBe(undefined);
			expect(secureLevel.enumNames).toBe(undefined);
		});

		describe("label", () => {
			it("not populated for root", async () => {
				const form = { fields: [ { name: "gatherings" } ]};
				const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.schema.title).toBe(undefined);
			});

			it("populated from property metadata", async () => {
				const form = { fields: [ { name: "gatherings" } ]};
				const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.schema.properties.gatherings.title).toBe("Keruutapahtumat");
			});

			it("can be overridden", async () => {
				const form = { fields: [ { name: "gatherings", label: "foo" } ]};
				const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.schema.properties.gatherings.title).toBe("foo");
			});

			it("can be overridden with empty", async () => {
				const form = { fields: [ { name: "gatherings", label: "" } ]};
				const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.schema.properties.gatherings.title).toBe("");
			});
		});
	});

	describe("validators", () => {
		it("empty object for undefined", async () => {
			const form = {};
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			expect(schemaFormat.validators).toEqual({});
			expect(schemaFormat.warnings).toEqual({});
		});

		it("populates validator and warnings", async () => {
			const form = { fields: [ { name: "gatherings", validators: { presence: true }, fields: [
				{ name: "units", validators: { presence: true }, warnings: { presence: true } }
			]} ]};
			const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
			expect(schemaFormat.validators.gatherings.presence).toBe(true);
			expect(schemaFormat.validators.gatherings.items.properties.units.presence).toBe(true);
			expect(schemaFormat.warnings.gatherings.items.properties.units.presence).toBe(true);
		});
		
		describe("default geometry validator", () => {
			it("is added", async () => {
				const form = { fields: [ { name: "gatherings", fields: [ { name: "geometry" } ]} ]};
				const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.validators.gatherings.items.properties.geometry.geometry.requireShape).toBe(true);
				expect(schemaFormat.validators.gatherings.items.properties.geometry.geometry.message.missingGeometries)
					.toBe("Paikalla täytyy olla vähintään yksi kuvio.");
			});

			it("messages can be overridden", async () => {
				const form = { fields: [ { name: "gatherings", fields: [ { name: "geometry" } ]} ],
					translations: {
						fi: {
							"@geometryValidation": "foo"
						}
					}
				};
				const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.validators.gatherings.items.properties.geometry.geometry.requireShape).toBe(true);
				expect(schemaFormat.validators.gatherings.items.properties.geometry.geometry.message.missingGeometries)
					.toBe("foo");
			});

			it("overriding overrides completely", async () => {
				const form = { fields: [ { name: "gatherings", fields: [
					{ name: "geometry", validators: { geometry: { foo: "bar" }} }
				]}]};
				const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
				const {geometry} = schemaFormat.validators.gatherings.items.properties;
				expect(geometry.geometry.requireShape).toBe(undefined);
				expect(geometry.geometry.foo).toBe("bar");
			});

			it("can be removed with false", async () => {
				const form = { fields: [ { name: "gatherings", fields: [
					{ name: "geometry", validators: { geometry: false } }
				]} ]};
				const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
				expect(schemaFormat.validators).toEqual({});
			});
		});
	});
});

describe("extra", () => {
	it("undefined if no fields with alt parents", async () => {
		const form = { fields: [ { name: "gatherings" } ]};
		const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
		expect(schemaFormat.extra).toBe(undefined);
	});

	it("populated from field with alt parents", async () => {
		const form = { fields: [ { name: "gatherings", fields: [ { name: "habitat" } ]} ]};
		const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
		const extra = schemaFormat.extra as any;
		expect(extra.habitat.altParent["MY.habitatEnumValue1"]).toEqual([]);
		expect(extra.habitat.altParent["MY.habitatEnumValue2"]).toEqual(["MY.habitatEnumValue1"]);
	});
});

describe("uiSchemaContext", () => {
	it("undefined if no fields with alt parents", async () => {
		const form = { fields: [ { name: "gatherings" } ]};
		const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
		expect(schemaFormat.uiSchemaContext).toBe(undefined);
	});

	it("populated from field with alt parents", async () => {
		const form = { fields: [ { name: "gatherings", fields: [ { name: "habitat" } ]} ]};
		const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
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
		const schemaFormat = await fieldService.masterToSchemaFormat(form);
		expect(schemaFormat.language).toBe(undefined);
	});

	it("added if not asked for", async () => {
		const form = { };
		const schemaFormat = await fieldService.masterToSchemaFormat(form, LANG);
		expect(schemaFormat.language).toBe(LANG);
	});
});

describe("prepopulatedDocument population", () => {

	let jsonFormat: SchemaFormat;
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
		jsonFormat = await fieldService.masterToSchemaFormat(form, LANG);
	});

	it("merges prepopulatedDocument and prepopulateWithInformalTaxonGroups", async () => {
		expect(jsonFormat.options.prepopulatedDocument.gatherings.length).toBe(1);
		const gathering = jsonFormat.options.prepopulatedDocument.gatherings[0];
		expect(gathering.units[0].notes).toBe("foo");
		expect(gathering.units[0].identifications[0].taxon).toBeTruthy();
	});

	it("populates with defaults", async () => {
		jsonFormat.options.prepopulatedDocument.gatherings[0].units.forEach((unit: any) => {
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

describe("translations", () => {
	it("doesn't crash when not present and is undefined", async () => {
		const form = { };
		const schemaFormat = await fieldService.masterToSchemaFormat(form);
		expect(schemaFormat.translations).toBe(undefined);
	});

	it("included when asked without lang", async () => {
		const form = { translations: {fi: {}, en: {}}};
		const schemaFormat = await fieldService.masterToSchemaFormat(form);
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

		const jsonFormat = await fieldService.masterToSchemaFormat(form, LANG);

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
