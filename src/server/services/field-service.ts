import MetadataService from "../../services/metadata-service";
import SchemaService from "./schema-service";
import ExpandedJSONService from "./expanded-json-service";
import { Field, Lang, Master, PropertyModel, SchemaFormat, Translations, Range, ExpandedMaster, isFormExtensionField,
	FormExtensionField, ExpandedJSONFormat, CommonFormat, Format } from "../../model";
import { reduceWith, unprefixProp, isObject, translate } from "../../utils";
import merge from "deepmerge";
import { applyPatch } from "fast-json-patch";
import { UnprocessableError } from "./main-service";
import ApiClient from "../../api-client";
import StoreService from "./store-service";

export interface InternalProperty extends PropertyModel {
	_rootProp?: boolean
}

export default class FieldService {
	private apiClient: ApiClient;
	private metadataService: MetadataService;
	private storeService: StoreService;
	private schemaService: SchemaService;
	private expandedJSONService: ExpandedJSONService;

	constructor(apiClient: ApiClient, metadataService: MetadataService, storeService: StoreService, lang: Lang) {
		this.apiClient = apiClient;
		this.metadataService = metadataService;
		this.storeService = storeService;
		this.schemaService = new SchemaService(metadataService, apiClient, lang);
		this.expandedJSONService = new ExpandedJSONService(metadataService, lang);

		this.addTaxonSets = this.addTaxonSets.bind(this);
		this.masterToSchemaFormat = this.masterToSchemaFormat.bind(this);
		this.linkMaster = this.linkMaster.bind(this);
	}

	setLang(lang: Lang) {
		this.schemaService.setLang(lang);
		this.expandedJSONService.setLang(lang);
	}

	masterToSchemaFormat(master: Master, lang?: Lang): Promise<SchemaFormat> {
		return this.convert(master, Format.Schema, lang);
	}

	masterToExpandedJSONFormat(master: Master, lang?: Lang): Promise<ExpandedJSONFormat> {
		return this.convert(master, Format.JSON, lang);
	}

	async convert(master: Master, format: Format.Schema, lang?: Lang) : Promise<SchemaFormat>
	async convert(master: Master, format: Format.JSON, lang?: Lang) : Promise<ExpandedJSONFormat>
	async convert(master: Master, format: Format, lang?: Lang) : Promise<SchemaFormat | ExpandedJSONFormat>
	{
		const expandedMaster = await this.expandMaster(master, lang);
		const rootField = expandedMaster.fields
			? this.getRootField(expandedMaster)
			: undefined;
		const rootProperty = rootField
			? this.getRootProperty(rootField)
			: undefined;
		const converter = format === "schema"
			? this.schemaService
			: this.expandedJSONService;
		const converted = await converter.convert(expandedMaster, rootField, rootProperty);
		return reduceWith(converted, undefined, [
			(converted) => lang && converted.translations && (lang in converted.translations)
				? translate(converted, converted.translations[lang]!)
				: converted,
			removeTranslations(lang)
		]);
	}

	private getRootField(master: Pick<Master, "context">): Field  {
		if (master.context && master.context.match(/[^.]+\..+/)) {
			throw new UnprocessableError("Don't use namespace prefix for context");
		}
		return {name: master.context ? unprefixProp(master.context) : "document"};
	}

	private getRootProperty(rootField: Field): InternalProperty {
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
			domain: [],
			_rootProp: true
		};
	}

	linkMaster(master: Master) {
		return reduceWith<any, undefined, ExpandedMaster>(
			JSON.parse(JSON.stringify(master)),
			undefined,
			[
				this.mapBaseForm,
				this.mapBaseFormFromFields
			]
		);
	}

	private async expandMaster(master: Master, lang?: Lang): Promise<ExpandedMaster> {
		const linkedMaster = await this.linkMaster(master);

		const rootField = linkedMaster.fields
			? this.getRootField(linkedMaster)
			: undefined;

		return reduceWith(linkedMaster, undefined, [
			addDefaultValidators,
			this.applyPatches,
			this.addTaxonSets,
			rootField && this.addExtra({...rootField || {}, fields: linkedMaster.fields}),
			addLanguage(lang)
		]);
	}

	mapBaseFormFrom(form: Master, baseForm: Master) {
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

	private mapBaseForm = async (master: Master) => {
		if (!master.baseFormID) {
			return master;
		}
		const baseForm: Master = await this.mapBaseForm(await this.storeService.getForm(master.baseFormID));
		return this.mapBaseFormFrom(master, baseForm);
	}

	mapBaseFormFromFields = async (master: Master) => {
		if (!master.fields) {
			return master;
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
		return master;

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

	private applyPatches(master: Master) {
		const {patch, ..._master} = master;
		return patch
			? (applyPatch(_master, patch, undefined, false).newDocument as Master)
			: master;
	}

	private addExtra <T>(field: Field) {
		return async (input: T) => {
			const toParentMap = (range: Range[]) => {
				return range.reduce((parentMap, item) => {
					parentMap[item.id] = item.altParent ? [item.altParent] : [];
					return parentMap;
				}, {} as Record<string, string[]>);
			};
			const recursively = async (field: Field, property: InternalProperty) => {
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
	async getError(master: Master) {
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
	if (language) {
		const {translations, ..._schemaFormat} = schemaFormat;
		return _schemaFormat;
	}
	return schemaFormat;
};

interface DefaultValidatorItem {
	validator: any;
	translations: Record<string, Record<Lang, string>>;
}

interface DefaultValidator {
	validators?: {[validatorName: string]: DefaultValidatorItem};
	warnings?: {[validatorName: string]: DefaultValidatorItem};
}

export const defaultGeometryValidator: DefaultValidator = {
	validators: {
		geometry: {
			validator: {
				requireShape: true,
				maximumSize: 10,
				includeGatheringUnits: true,
				message: {
					missingGeometries: "@geometryValidation",
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
					en: "Gathering must have at least one feature.",
					sv: "Platsen måste ha åtminstone en figur.",
					fi: "Paikalla täytyy olla vähintään yksi kuvio."
				},
				"@geometryHectaresMaxValidation": {
					en: "Too big area. Maximum is %{max} hectares",
					sv: "För stort område. Maximalt är %{max} hektar",
					fi: "Liian iso alue. Maksimi on %{max} hehtaaria",
				}
			}
		}
	}
};

const defaultValidators: Record<string, DefaultValidator> = {
	"/gatherings/geometry": defaultGeometryValidator
};

const addDefaultValidators = (master: ExpandedMaster) => {
	const recursively = (fields: Field[], path: string) => {
		fields.forEach(field => {
			const nextPath = `${path}/${field.name}`;
			const _defaultValidators = defaultValidators[nextPath]?.["validators"];

			_defaultValidators && Object.keys(_defaultValidators).forEach(validatorName => {
				if (validatorName in (field.validators || {})) {
					if (field.validators[validatorName] === false) {
						delete field.validators[validatorName];
					}
					return;
				}
				if (!field.validators) {
					field.validators = {};
				}
				const defaultValidator = _defaultValidators[validatorName];
				field.validators[validatorName] = defaultValidator.validator;
				if (defaultValidator.translations) {
					master.translations = {
						...(master.translations || {}),
						fi: (master.translations?.fi || {}),
						sv: (master.translations?.sv || {}),
						en: (master.translations?.en || {}),
					};
					Object.keys(defaultValidator.translations).forEach(translationKey => {
						Object.keys(defaultValidator.translations[translationKey]).forEach((lang: Lang) => {
							if (!(translationKey in (master.translations as Translations)[lang]!)) {
								(master.translations as Translations)[lang]![translationKey] =
									defaultValidator.translations[translationKey][lang];
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

export const mapUnknownFieldWithTypeToProperty = (field: Field): InternalProperty => {
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
