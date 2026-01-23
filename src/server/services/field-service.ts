import MetadataService from "../../services/metadata-service";
import SchemaService from "./schema-service";
import ExpandedJSONService from "./expanded-json-service";
import { Field, Lang, Master, Property, SchemaFormat, Translations, Range, ExpandedMaster, ExpandedJSONFormat,
	CommonFormat, Format, isLang, JSONObject } from "../../model";
import { reduceWith, unprefixProp, isObject, translate, bypass, getPropertyContextName, getRootField as _getRootField,
	getRootProperty } from "../../utils";
import merge from "deepmerge";
import { UnprocessableError } from "./main-service";
import ApiClient from "../../api-client";
import StoreService from "./store-service";
import ConverterService from "./converter-service";
import UiSchemaService from "./uischema-service";
import FormExpanderService from "../../services/form-expander-service";

export default class FieldService {
	private apiClient: ApiClient;
	private metadataService: MetadataService;
	private storeService: StoreService;
	private schemaService: SchemaService;
	private expandedJSONService: ExpandedJSONService;
	private uiSchemaService: UiSchemaService;
	private formExpanderService: FormExpanderService;

	constructor(apiClient: ApiClient, metadataService: MetadataService, storeService: StoreService, lang: Lang) {
		this.apiClient = apiClient;
		this.metadataService = metadataService;
		this.storeService = storeService;
		this.schemaService = new SchemaService(metadataService, apiClient, lang);
		this.expandedJSONService = new ExpandedJSONService(metadataService, lang);
		this.uiSchemaService = new UiSchemaService(this.metadataService);
		this.formExpanderService = new FormExpanderService(this.storeService);

		this.addTaxonSets = this.addTaxonSets.bind(this);
		this.masterToSchemaFormat = this.masterToSchemaFormat.bind(this);
		this.linkMaster = this.linkMaster.bind(this);
		this.expand = this.expand.bind(this);
	}

	setLang(lang: Lang) {
		this.schemaService.setLang(lang);
		this.expandedJSONService.setLang(lang);
	}

	expand(master: Master) {
		return this.formExpanderService.expandMaster(master);
	}

	masterToSchemaFormat(master: Master, lang?: Lang): Promise<SchemaFormat> {
		return this.convert(master, Format.Schema, lang);
	}

	masterToExpandedJSONFormat(master: Master, lang?: Lang): Promise<ExpandedJSONFormat> {
		return this.convert(master, Format.JSON, lang);
	}

	async convert(master: Master, format: Format.Schema, lang?: Lang) : Promise<SchemaFormat>
	async convert(master: Master, format: Format.JSON, lang?: Lang) : Promise<ExpandedJSONFormat>
	async convert(master: Master, format: Format, lang?: Lang) : Promise<SchemaFormat | ExpandedJSONFormat> {
		const expandedMaster = await this.expand(master);

		const rootField = expandedMaster.fields
			? getRootField(expandedMaster)
			: undefined;

		const rootProperty = rootField
			? getRootProperty(rootField)
			: undefined;

		let converter: ConverterService<any>;
		switch (format) {
		case Format.Schema:
			converter = this.schemaService;
			break;
		case Format.JSON:
			converter = this.expandedJSONService;
			break;
		}

		const masterAfterFieldRelatedOperations = reduceWith(expandedMaster, undefined,
			addDefaultValidators,
			this.addTaxonSets,
			rootField ? this.addExtra({...rootField, fields: expandedMaster.fields}) : bypass,
			master => rootField && rootProperty
				? this.uiSchemaService.expandUiSchema(master, rootField, rootProperty, lang)
				: master
		);

		return reduceWith(masterAfterFieldRelatedOperations, undefined, 
			master => converter.convert(master, rootField, rootProperty) as Promise<CommonFormat>,
			(converted) => lang && converted.translations && (lang in converted.translations)
				? translate(converted, converted.translations[lang]!)
				: converted,
			addLanguage(lang),
			removeTranslations(lang),
			addEmptyOptions
		);
	}

	linkMaster(master: Master) {
		return this.formExpanderService.linkMaster(master);
	}

	mapBaseFormFrom<T extends Pick<Master, "baseFormID" | "translations" | "uiSchema">>(form: T, baseForm: Master)
	: Omit<T, "baseFormID"> {
		const {id, ..._baseForm} = baseForm;
		form = {
			..._baseForm,
			...form,
			translations: merge(_baseForm.translations || {}, form.translations || {}),
			uiSchema: merge(_baseForm.uiSchema || {}, form.uiSchema || {})
		};
		delete form.baseFormID;
		return form;
	}

	private addExtra<T extends Record<string, unknown>>(field: Field) {
		return async (input: T): Promise<T & Pick<Master, "extra">> => {
			const toParentMap = (range: Range[]) => {
				return range.reduce((parentMap, item) => {
					parentMap[item.id] = item.altParent ? [item.altParent] : [];
					return parentMap;
				}, {} as Record<string, string[]>);
			};
			const recursively = async (field: Field, property: Property) => {
				const range = property.range;
				if (await this.metadataService.isAltRange(range)) {
					const rangeModel = await this.metadataService.getAlt(range);
					if (rangeModel.some(item => item.altParent)) { 
						return {[unprefixProp(property.property)]: {altParent: toParentMap(rangeModel)}};
					}
				} else if (field.fields) {
					let collectedTrees = {};
					const properties = await this.metadataService.getPropertiesForEmbeddedProperty(property.range);
					for (const _field of field.fields) {
						let prop = properties.find(p => unprefixProp(p.property) === _field.name);
						if (!prop) {
							prop = mapUnknownFieldWithTypeToProperty(_field);
						}
						collectedTrees = {...collectedTrees, ...(await recursively(_field, prop))};
					}
					return collectedTrees;
				}
				return {};
			};

			const extra = await recursively(field, getRootProperty(field));
			return Object.keys(extra).length ? {...input, extra} : input;
		};
	}

	private addTaxonSets<T>(master: T): Promise<T> {
		const recursively = async (any: any) => {
			if (isObject(any)) {
				for (const key of Object.keys(any)) {
					any[key] = await recursively(any[key]);
				}
			} else if (Array.isArray(any)) {
				for (const key in any) {
					any[key] = await recursively(any[key]);
				}
			} else if (typeof any === "string" && any.startsWith("...taxonSet:")) {
				const taxonSets = any.replace("...taxonSet:", "").split(",");
				const taxonSetResults = await Promise.all(taxonSets.map(taxonSet => this.apiClient.fetchJSON(
					"/taxa",
					{pageSize: 1000, selectedFields: "id"},
					{ method: "POST", body: { taxonSets: taxonSet } }
				)));
				return taxonSetResults
					.reduce((flat, result) => [...flat, ...result.results], [])
					.map(({id}: any) => id) || [];
			}
			return any;
		};
		return recursively(master);
	}

	/**
	 * Returns an error if the form is invalid, undefined if valid.
	 */
	async validate(master: Master) {
		try {
			await this.convert(master, Format.Schema);
		} catch (e) {
			return e;
		}
	}
}

const addLanguage = (language?: Lang) => <T>(obj: T) =>
	language
		? {...obj, language}
		: obj;

export const removeTranslations = <T extends Pick<Master, "translations">>(language?: Lang) => (master: T) => {
	if (isLang(language)) {
		const {translations, ..._master} = master;
		return _master;
	}
	return master;
};

export const addEmptyOptions = <T extends {options?: CommonFormat["options"]}>(form: T)
	: Omit<T, "options"> & {options: CommonFormat["options"]} => 
		({...form, options: form.options || {}});

type DefaultValidatorItem = {
	options: JSONObject;
	translations?: Record<string, Record<Lang, string>>;
	mergeStrategy?: "replace" | "merge" // Defaults to "replace".
}

type DefaultValidator = {
	validators?: {[validatorName: string]: DefaultValidatorItem};
	warnings?: {[validatorName: string]: DefaultValidatorItem};
}

const defaultGeometryValidator: DefaultValidator = {
	validators: {
		geometry: {
			options: {
				requireShape: true,
				message: {
					missingGeometries: "@geometryValidationAtLeastOne",
					invalidBoundingBoxHectares: "@geometryHectaresMaxValidation",
					notGeometry: "@geometryValidation",
					missingType: "@geometryValidation",
					invalidRadius: "@geometryValidation",
					invalidCoordinates: "@geometryValidation",
					invalidGeometries: "@geometryValidation",
					noOverlap: "@geometryValidation",
					polygonsWithHoles: "@geometryPolygonsWithHolesValidation"
				},
				boundingBoxMaxHectares: 1000000,
				polygonsWithHoles: true
			},
			translations: {
				"@geometryValidation": {
					en: "Invalid geometry",
					sv: "Ogiltig geometri",
					fi: "Epäkelpo kuvio"
				},
				"@geometryValidationAtLeastOne": {
					en: "Must have at least one feature",
					sv: "Måste ha åtminstone en figur",
					fi: "Täytyy olla vähintään yksi kuvio"
				},
				"@geometryHectaresMaxValidation": {
					en: "Too big area. Maximum is %{max} hectares",
					sv: "För stort område. Maximalt är %{max} hektar",
					fi: "Liian iso alue. Maksimi on %{max} hehtaaria",
				},
				"@geometryPolygonsWithHolesValidation": {
					en: "Polygons with holes are not allowed",
					sv: "Polygoner med hål är inte tillåtna",
					fi: "Polygonilla ei saa olla reikiä"
				},
			},
			mergeStrategy: "merge"
		}
	}
};

const defaultGatheringGeometryWarnings: DefaultValidator = {
	validators: defaultGeometryValidator.validators,
	warnings: {
		geometry: {
			options: {
				boundingBoxMaxHectares: 500000,
				includeGatheringUnits: true,
				message: {
					invalidBoundingBoxHectares: "@geometryHectaresMaxValidationWarning"
				}
			},
			translations: {
				"@geometryHectaresMaxValidationWarning": {
					en: "It's a very large area",
					sv: "Det är ett mycket stort område.",
					fi: "Alue on hyvin iso",
				},
			},
			mergeStrategy: "merge"
		}
	}
};

const defaultDateValidator: DefaultValidator = {
	validators: {
		datetime: {
			options: {
				earliest: "1000-01-01",
				tooEarly: "@dateTooEarlyValidation"
			},
			translations: {
				"@dateTooEarlyValidation": {
					en: "Date is too early. Earliest possible is %{date}",
					sv: "Datumet är för tidigt. Tidigast möjliga är %{date}",
					fi: "Päivämäärä on liian varhainen. Varhaisin mahdollinen on %{date}",
				}
			},
			mergeStrategy: "merge"
		}
	},
};

/* 
 * Validation is done context-aware, so that e.g. { "MY.document": { geometry: <validator> } } will validate each
 * MY.geometry (MY.document's geometry), but not e.g. MNP.geometry (MNP.namedPlace's geometry). If the field pointer is
 * a JSON Pointer, the schema structure matching the pointer will use that validator, overriding any other validators.
 */
const defaultValidators: Record<string, Record<string, DefaultValidator>> = {
	"MY.document": {
		"geometry": defaultGeometryValidator,
		"/gatherings/geometry": defaultGatheringGeometryWarnings,
		"dateBegin": defaultDateValidator,
		"dateEnd": defaultDateValidator
	}
};

const addDefaultValidators = <T extends Pick<ExpandedMaster, "fields" | "translations" | "context">>(master: T): T  => {
	const contextDefaultValidators = defaultValidators[getPropertyContextName(master.context)];
	if (!contextDefaultValidators) {
		return master;
	}

	const recursively = (fields: Field[], path: string) => {
		fields.forEach(field => {
			const nextPath = `${path}/${field.name}`;
			(["validators", "warnings"] as const).forEach(validationLevel => {
				const _defaultValidators = contextDefaultValidators[nextPath]?.[validationLevel]
					|| contextDefaultValidators[field.name]?.[validationLevel];

				_defaultValidators && Object.keys(_defaultValidators).forEach(validatorName => {
					const defaultValidator = _defaultValidators[validatorName];
					const {mergeStrategy = "replace"} = defaultValidator;
					if (field[validationLevel] && validatorName in (field[validationLevel]!)) {
						if (field[validationLevel]![validatorName] === false) {
							delete field[validationLevel]![validatorName];
							return;
						}
						if (mergeStrategy === "replace") {
							return;
						}
					}
					if (!field[validationLevel]) {
						field[validationLevel] = {};
					}
					if (mergeStrategy === "merge" && field[validationLevel]![validatorName]) {
						field[validationLevel]![validatorName] = merge(
							defaultValidator.options,
							field[validationLevel]![validatorName] as JSONObject
						);
					} else { // "replace" strategy, used also if strategy is "merge" but there is nothing to merge.
						field[validationLevel]![validatorName] = defaultValidator.options;
					}
					if (defaultValidator.translations) {
						master.translations = {
							...(master.translations || {}),
							fi: (master.translations?.fi || {}),
							sv: (master.translations?.sv || {}),
							en: (master.translations?.en || {}),
						};
						Object.keys(defaultValidator.translations).forEach(translationKey => {
							Object.keys(defaultValidator.translations![translationKey]).forEach((lang: Lang) => {
								if (!(translationKey in (master.translations as Translations)[lang]!)) {
									(master.translations as Translations)[lang]![translationKey] =
										defaultValidator.translations![translationKey][lang];
								}
							});
						});
					}
				});
			});
			recursively(field.fields || [], nextPath);
		});
	};

	recursively(master.fields || [], "");
	return master;
};

const mapFieldType = (type?: string) => {
	switch (type) {
	case ("checkbox"):
		return "xsd:boolean";
	case ("text"):
	default:
		return "xsd:string";
	}
};

export const mapUnknownFieldWithTypeToProperty = (field: Field): Property => {
	if (!field.type) {
		throw new UnprocessableError(`Bad field ${field.name}`);
	}
	return {
		property: field.name,
		range: mapFieldType(field.type),
		shortName: field.name,
		label: {},
		isEmbeddable: false,
		maxOccurs: "1",
		minOccurs: "0",
		multiLanguage: false,
		required: false,
		domain: []
	};
};

export const getRootField = (master: Pick<Master, "context">): Field => {
	if (master.context === "document") {
		master.context = "MY.document";
	}
	if (master.context === "namedPlace") {
		master.context = "MNP.namedPlace";
	}
	if (master.context === "organization") {
		master.context = "MOS.organization";
	}
	if (master.context === "specimenTransaction") {
		master.context = "HRX.specimenTransaction";
	}
	if (master.context === "dataset") {
		master.context = "GX.dataset";
	}
	if (master.context === "audio") {
		master.context = "MM.audio";
	}
	if (master.context === "annotation") {
		master.context = "MAN.annotation";
	}
	if (master.context === "image") {
		master.context = "MM.image";
	}
	// if (master.context && master.context.match(/[^.]+\..+/)) {
	// 	throw new UnprocessableError("Don't use namespace prefix for context");
	// }
	return _getRootField(master);
};

