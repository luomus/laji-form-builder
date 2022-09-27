import MetadataService from "../../services/metadata-service";
import SchemaService from "./schema-service";
import ExpandedJSONService from "./expanded-json-service";
import { Field, Lang, Master, Property, SchemaFormat, Translations, Range, ExpandedMaster, isFormExtensionField,
	FormExtensionField, ExpandedJSONFormat, CommonFormat, Format, isLang, JSONSchemaEnumOneOf, JSONSchemaV6Enum
} from "../../model";
import { reduceWith, unprefixProp, isObject, translate, bypass, getPropertyContextName } from "../../utils";
import merge from "deepmerge";
import { applyPatch } from "fast-json-patch";
import { UnprocessableError } from "./main-service";
import ApiClient from "../../api-client";
import StoreService from "./store-service";
import ConverterService from "./converter-service";

export default class FieldService {
	private apiClient: ApiClient;
	private metadataService: MetadataService;
	private storeService: StoreService;
	private schemaService: SchemaService<JSONSchemaEnumOneOf>;
	private schemaServiceWithEnums: SchemaService<JSONSchemaV6Enum>;
	private expandedJSONService: ExpandedJSONService;

	constructor(apiClient: ApiClient, metadataService: MetadataService, storeService: StoreService, lang: Lang) {
		this.apiClient = apiClient;
		this.metadataService = metadataService;
		this.storeService = storeService;
		this.schemaService = new SchemaService(metadataService, apiClient, lang);
		this.schemaServiceWithEnums = new SchemaService(metadataService, apiClient, lang, true);
		this.expandedJSONService = new ExpandedJSONService(metadataService, lang);

		this.addTaxonSets = this.addTaxonSets.bind(this);
		this.masterToSchemaFormat = this.masterToSchemaFormat.bind(this);
		this.linkMaster = this.linkMaster.bind(this);
	}

	setLang(lang: Lang) {
		this.schemaService.setLang(lang);
		this.schemaServiceWithEnums.setLang(lang);
		this.expandedJSONService.setLang(lang);
	}

	masterToSchemaFormat(master: Master, lang?: Lang): Promise<SchemaFormat> {
		return this.convert(master, Format.Schema, lang);
	}

	masterToSchemaWithEnumsFormat(master: Master, lang?: Lang): Promise<SchemaFormat<JSONSchemaV6Enum>> {
		return this.convert(master, Format.SchemaWithEnums, lang);
	}

	masterToExpandedJSONFormat(master: Master, lang?: Lang): Promise<ExpandedJSONFormat> {
		return this.convert(master, Format.JSON, lang);
	}

	async convert(master: Master, format: Format.Schema, lang?: Lang) : Promise<SchemaFormat>
	async convert(master: Master, format: Format.SchemaWithEnums, lang?: Lang) : Promise<SchemaFormat<JSONSchemaV6Enum>>
	async convert(master: Master, format: Format.JSON, lang?: Lang) : Promise<ExpandedJSONFormat>
	async convert(master: Master, format: Format, lang?: Lang) : Promise<SchemaFormat | ExpandedJSONFormat> {
		const expandedMaster = await this.expandMaster(master, lang);
		const rootField = expandedMaster.fields
			? this.getRootField(expandedMaster)
			: undefined;
		const rootProperty = rootField
			? this.getRootProperty(rootField)
			: undefined;
		let converter: ConverterService<any>;
		switch (format) {
		case Format.Schema:
			converter = this.schemaService;
			break;
		case Format.SchemaWithEnums:
			converter = this.schemaServiceWithEnums;
			break;
		case Format.JSON:
			converter = this.expandedJSONService;
			break;
		}
		const converted = await converter.convert(expandedMaster, rootField, rootProperty) as CommonFormat;
		return reduceWith(converted, undefined, 
			(converted) => lang && converted.translations && (lang in converted.translations)
				? translate(converted, converted.translations[lang]!)
				: converted,
			removeTranslations(lang),
			addEmptyOptions
		);
	}

	private getRootField(master: Pick<Master, "context">): Field {
		if (master.context && master.context.match(/[^.]+\..+/)) {
			throw new UnprocessableError("Don't use namespace prefix for context");
		}
		return {name: unprefixProp(getPropertyContextName(master.context))};
	}

	private getRootProperty(rootField: Field): Property {
		return {
			property: rootField.name,
			isEmbeddable: true,
			range: [rootField.name],
			label: {},
			shortName: unprefixProp(rootField.name),
			required: true,
			minOccurs: "1",
			maxOccurs: "1",
			multiLanguage: false,
			domain: []
		};
	}

	linkMaster(master: Master) {
		return reduceWith(
			JSON.parse(JSON.stringify(master)) as Master,
			undefined,
			this.mapBaseForm,
			this.mapBaseFormFromFields,
		);
	}

	private async expandMaster(master: Master, lang?: Lang): Promise<ExpandedMaster> {
		const linkedMaster = await this.linkMaster(master);

		const rootField = linkedMaster.fields
			? this.getRootField(linkedMaster)
			: undefined;

		return reduceWith(linkedMaster, undefined,
			addDefaultValidators,
			this.applyPatches,
			this.addTaxonSets,
			rootField && this.addExtra({...rootField || {}, fields: linkedMaster.fields}) || bypass,
			addLanguage(lang)
		);
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

	private mapBaseForm = async <T extends Pick<Master, "baseFormID" | "translations" | "uiSchema">>(master: T)
	: Promise<Omit<T, "baseFormID">> => {
		if (!master.baseFormID) {
			return master;
		}
		const baseForm = await this.mapBaseForm(await this.storeService.getForm(master.baseFormID));
		return this.mapBaseFormFrom(master, baseForm);
	}

	mapBaseFormFromFields = async <T extends Pick<Master, "fields" | "translations" | "uiSchema" | "context">>
	(master: T) : Promise<Omit<T, "fields"> & { fields?: Field[]; }> => {
		if (!master.fields) {
			return master as (T & { fields?: Field[]; });
		}

		for (const idx in master.fields) {
			const f = master.fields[idx];
			if (!isFormExtensionField(f)) {
				continue;
			}
			const {formID} = f;
			master.fields.splice(+idx, 1);
			const {fields, uiSchema, translations, context} =
				await this.expandMaster(await this.storeService.getForm(formID));
			master.translations = merge(translations || {}, master.translations || {});
			master.uiSchema = merge(master.uiSchema || {}, uiSchema || {});
			if (!master.context && context) {
				master.context = context;
			}
			if (!fields) {
				continue;
			}
			master.fields = mergeFields(master.fields, fields);
		}
		return master as (T & { fields?: Field[]; });

		function mergeFields(fieldsFrom: (Field | FormExtensionField)[], fieldsTo: (Field | FormExtensionField)[])
			: (Field | FormExtensionField)[] {
			fieldsFrom.forEach(f => {
				if (isFormExtensionField(f)) {
					return;
				}
				const {name} = f;
				const exists = fieldsTo.find(f => !isFormExtensionField(f) && f.name === name) as Field;
				if (exists && f.fields && exists.fields) {
					mergeFields(f.fields, exists.fields);
				} else {
					fieldsTo.push(f);
				}
			});
			return fieldsTo;
		}
	}

	private applyPatches<T extends Pick<Master, "patch">>(master: T): Omit<T, "patch"> {
		const {patch, ..._master} = master;
		return patch
			? (applyPatch(_master, patch, undefined, false).newDocument as T)
			: master;
	}

	private addExtra<T>(field: Field) {
		return async (input: T) => {
			const toParentMap = (range: Range[]) => {
				return range.reduce((parentMap, item) => {
					parentMap[item.id] = item.altParent ? [item.altParent] : [];
					return parentMap;
				}, {} as Record<string, string[]>);
			};
			const recursively = async (field: Field, property: Property) => {
				const range = property.range[0];
				if (await this.metadataService.isAltRange(range)) {
					const rangeModel = await this.metadataService.getRange(range);
					if (rangeModel.some(item => item.altParent)) { 
						return {[unprefixProp(property.property)]: {altParent: toParentMap(rangeModel)}};
					}
				} else if (field.fields) {
					let collectedTrees = {};
					const properties = await this.metadataService.getProperties(property.range[0]);
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

			const extra = await recursively(field, this.getRootProperty(field));
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
					{pageSize: 1000, taxonSets: taxonSet, selectedFields: "id"}
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

export const removeTranslations = (language?: Lang) => (schemaFormat: CommonFormat) => {
	if (isLang(language)) {
		const {translations, ..._schemaFormat} = schemaFormat;
		return _schemaFormat;
	}
	return schemaFormat;
};

export const addEmptyOptions = <T extends {options?: CommonFormat["options"]}>(form: T)
	: Omit<T, "options"> & {options: CommonFormat["options"]} => 
		({...form, options: form.options || {}});

interface DefaultValidatorItem {
	validator: any;
	translations?: Record<string, Record<Lang, string>>;
	mergeStrategy?: "replace" | "merge" // Defaults to "replace".
}

interface DefaultValidator {
	validators?: {[validatorName: string]: DefaultValidatorItem};
	warnings?: {[validatorName: string]: DefaultValidatorItem};
}

const defaultGeometryValidator: DefaultValidator = {
	validators: {
		geometry: {
			validator: {
				maximumSize: 10,
				message: {
					missingGeometries: "@geometryValidationAtLeastOne",
					invalidBoundingBoxHectares: "@geometryHectaresMaxValidation",
					notGeometry: "@geometryValidation",
					missingType: "@geometryValidation",
					invalidRadius: "@geometryValidation",
					invalidCoordinates: "@geometryValidation",
					invalidGeometries: "@geometryValidation",
					noOverlap: "@geometryValidation"
				},
				boundingBoxMaxHectares: 5000000
			},
			translations: {
				"@geometryValidation": {
					en: "Invalid geometry",
					sv: "Ogiltig geometri",
					fi: "Epäkelpo kuvio"
				},
				"@geometryValidationAtLeastOne": {
					en: "Must have at least one feature.",
					sv: "Måste ha åtminstone en figur.",
					fi: "Täytyy olla vähintään yksi kuvio."
				},
				"@geometryHectaresMaxValidation": {
					en: "Too big area. Maximum is %{max} hectares",
					sv: "För stort område. Maximalt är %{max} hektar",
					fi: "Liian iso alue. Maksimi on %{max} hehtaaria",
				}
			},
			mergeStrategy: "merge"
		}
	}
};

const defaultGatheringGeometryValidator: DefaultValidator = merge(
	defaultGeometryValidator,
	{
		validators: {
			geometry: {
				validator: {
					requireShape: true,
					includeGatheringUnits: true,
					message: {
						missingGeometries: "@gatheringGeometryValidationAtLeastOne",
					}
				},
				translations: {
					"@gatheringGeometryValidationAtLeastOne": {
						en: "Gathering must have at least one feature.",
						sv: "Platsen måste ha åtminstone en figur.",
						fi: "Paikalla täytyy olla vähintään yksi kuvio."
					},
				},
				mergeStrategy: "replace"
			}
		}
	}
);

const defaultDateValidator: DefaultValidator = {
	validators: {
		datetime: {
			validator: {
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
 * Validation is done context-aware, so that e.g. { document: { geometry: <validator> } } will validate each MY.geometry
 * (MY.document's geometry), but not e.g. MNP.geometry (MNP.namedPlace's geometry). If the field pointer is a JSON
 * Pointer, the schema structure matching the pointer will use that validator, overriding any other validators.
 */
const defaultValidators: Record<string, Record<string, DefaultValidator>> = {
	"document": {
		"geometry": defaultGeometryValidator,
		"/gatherings/geometry": defaultGatheringGeometryValidator,
		"dateBegin": defaultDateValidator,
		"dateEnd": defaultDateValidator
	}
};

const addDefaultValidators = <T extends Pick<ExpandedMaster, "fields" | "translations" | "context">>(master: T): T  => {
	const contextDefaultValidators = defaultValidators[unprefixProp(getPropertyContextName(master.context))];
	if (!contextDefaultValidators) {
		return master;
	}

	const recursively = (fields: Field[], path: string) => {
		fields.forEach(field => {
			const nextPath = `${path}/${field.name}`;
			const _defaultValidators = contextDefaultValidators[nextPath]?.["validators"]
				|| contextDefaultValidators[field.name]?.["validators"];

			_defaultValidators && Object.keys(_defaultValidators).forEach(validatorName => {
				const defaultValidator = _defaultValidators[validatorName];
				const {mergeStrategy = "replace"} = defaultValidator;
				if (validatorName in (field.validators || {})) {
					if (field.validators[validatorName] === false) {
						delete field.validators[validatorName];
						return;
					}
					if (mergeStrategy === "replace") {
						return;
					}
				}
				if (!field.validators) {
					field.validators = {};
				}
				if (mergeStrategy === "merge" && field.validators[validatorName]) {
					field.validators[validatorName] =
						merge(defaultValidator.validator, field.validators[validatorName]);
				} else { // "replace" strategy, used also if strategy is "merge" but there is nothing to merge.
					field.validators[validatorName] = defaultValidator.validator;
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
		range: [mapFieldType(field.type)],
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
