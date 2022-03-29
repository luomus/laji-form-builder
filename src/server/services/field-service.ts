import ApiClient from "laji-form/lib/ApiClient";
import MetadataService from "../../services/metadata-service";
import { Field, JSONSchemaE, Lang, Master, PropertyModel, SchemaFormat, Translations, Range, AltTreeNode, AltTreeParent,
	FieldOptions, 
	ExtendedMaster,
	isFormExtensionField,
	FormExtensionField} from "../../model";
import { reduceWith, JSONSchema, multiLang, translate, unprefixProp, isObject } from "../../utils";
import merge from "deepmerge";
import { applyPatch } from "fast-json-patch";
import * as rjsf from "@rjsf/core";
import { formFetch, UnprocessableError } from "./main-service";

interface InternalProperty extends PropertyModel {
	_rootProp?: boolean
}

export default class FieldService {
	private apiClient: ApiClient;
	private metadataService: MetadataService;
	private lang: Lang;

	constructor(apiClient: ApiClient, metadataService: MetadataService, lang: Lang) {
		this.apiClient = apiClient;
		this.metadataService = metadataService;
		this.lang = lang;

		this.addTaxonSets = this.addTaxonSets.bind(this);
		this.prepopulate = this.prepopulate.bind(this);
		this.masterToSchemaFormat = this.masterToSchemaFormat.bind(this);
	}

	setLang(lang: Lang) {
		this.lang = lang;
		this.metadataService.setLang(lang);
		this.apiClient.setLang(lang);
	}

	async masterToSchemaFormat(rawMaster: Master, lang?: Lang): Promise<SchemaFormat> {
		const master = await this.parseMaster(rawMaster);
		const rootField = master.fields
			? this.getRootField(master)
			: undefined;

		const schema = rootField
			? await this.masterToJSONSchema(master, rootField)
			: {};
		const {fields, "@type": _type, "@context": _context, ..._master} = master;
		return reduceWith(
			{
				schema,
				uiSchema: {},
				excludeFromCopy: [],
				..._master
			} as (SchemaFormat & Pick<Master, "translations">),
			master,
			[
				addValidators("validators"),
				addValidators("warnings"),
				addAttributes,
				addExcludeFromCopy,
				rootField ? this.addExtra({...rootField || {}, fields: master.fields}) : undefined,
				addUiSchemaContext,
				addLang(lang),
				this.prepopulate,
				(schemaFormat) => lang && schemaFormat.translations
					? translate(schemaFormat, schemaFormat.translations[lang])
					: schemaFormat,
				removeTranslations(lang)
			]
		);
	}

	private async masterToJSONSchema(master: ExtendedMaster, rootField: Field): Promise<SchemaFormat["schema"]> {
		const {fields} = master;
		if (!fields || !fields.length) {
			return Promise.resolve(JSONSchema.object());
		}

		return this.fieldToSchema(
			{...rootField, fields},
			this.getRootProperty(rootField)
		);
	}

	private getRootField(master: Pick<Master, "context">): Field  {
		return {name: master.context || "MY.document"};
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

	private async fieldToSchema(
		field: Field,
		property: InternalProperty,
	): Promise<JSONSchemaE> {
		const {fields = []} = field;

		const transformationsForAllTypes = [
			addExcludeFromCopyToSchema,
			optionsToSchema,
			addTitle(property, this.lang),
			addDefault
		];

		if (property.isEmbeddable) {
			const properties = fields
				? (await this.metadataService.getProperties(property.range[0]))
					.reduce<Record<string, InternalProperty>>((propMap, prop) => {
						if (fields.some(f => unprefixProp(prop.property) === unprefixProp(f.name))) {
							propMap[unprefixProp(prop.property)] = prop;
						}
						return propMap;
					}, {})
				: {};

			const schemaProperties = await Promise.all(
				fields.map(async field => {
					let prop = properties[unprefixProp(field.name)];
					if (!prop) {
						prop = this.mapUnknownFieldWithTypeToProperty(field);
					}
					return [
						field.name,
						await this.fieldToSchema(field, prop)
					] as [string, JSONSchemaE];
				})
			);
			return reduceWith(
				mapEmbeddable(
					field,
					schemaProperties.reduce((ps, [name, schema]) => ({...ps, [unprefixProp(name)]: schema}), {}),
				),
				field,
				[
					addRequireds(properties),
					mapMaxOccurs(property),
					...transformationsForAllTypes
				]
			);
		} else {
			return reduceWith<JSONSchemaE, Field>(
				this.metadataService.getJSONSchemaFromProperty(property),
				field,
				[
					addValueOptions,
					filterWhitelist,
					filterBlacklist,
					hide,
					...transformationsForAllTypes
				]
			);
		}
	}

	private mapFieldType(type?: string) {
		switch (type) {
		case ("checkbox"):
			return "xsd:boolean";
		case ("text"):
		default:
			return "xsd:string";
		}
	}

	private mapUnknownFieldWithTypeToProperty(field: Field): InternalProperty {
		if (!field.type) {
			throw new UnprocessableError(`Bad field ${field.name}`);
		}
		return {
			property: field.name,
			range: [this.mapFieldType(field.type)],
			shortName: field.name,
			label: {},
			isEmbeddable: false,
			maxOccurs: "1",
			minOccurs: "0",
			multiLanguage: false,
			required: false,
			domain: []
		};
	}

	private parseMaster(master: Master): Promise<ExtendedMaster> {
		return reduceWith(JSON.parse(JSON.stringify(master)), undefined, [
			this.mapBaseForm,
			this.mapBaseFormFromFields,
			addDefaultValidators,
			this.applyPatches,
			this.addTaxonSets
		]) as Promise<ExtendedMaster>;
	}

	private mapBaseForm = async (master: Master) => {
		if (!master.baseFormID) {
			return master;
		}
		const baseForm = await this.mapBaseForm(await formFetch(`/${master.baseFormID}`));
		delete (baseForm as any).id;
		master = {
			...baseForm,
			...master,
			translations: merge(baseForm.translations || {}, master.translations || {}),
			uiSchema: merge(baseForm.uiSchema || {}, master.uiSchema || {})
		};
		delete master.baseFormID;
		return master;
	}

	private mapBaseFormFromFields = async (master: Master) => {
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
				await this.parseMaster(await formFetch(`/${formID}`));
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
			? (applyPatch(_master, patch).newDocument as Master)
			: master;
	}


	private addExtra(field: Field) {
		return async (schemaFormat: SchemaFormat) => {
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
						let prop = properties.find(p => unprefixProp(p.property) === unprefixProp(_field.name));
						if (!prop) {
							prop = this.mapUnknownFieldWithTypeToProperty(_field);
						}
						collectedTrees = {...collectedTrees, ...(await recursively(_field, prop))};
					}
					return collectedTrees;
				}
				return {};
			};

			const extra = await recursively(field, this.getRootProperty(field));
			return Object.keys(extra).length ? {...schemaFormat, extra} : schemaFormat;
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
				const taxonSet = await this.apiClient.fetch(
					"/taxa",
					{pageSize: 1000, taxonSets: any.split(":")[1], selectedFields: "id"}
				);
				return taxonSet.results?.map(({id}: any) => id) || [];
			}
			return any;
		};
		return recursively(master);
	}


	private async prepopulate(schemaFormat: SchemaFormat) {
		const {prepopulatedDocument, prepopulateWithInformalTaxonGroups} = schemaFormat.options || {};
		if (!prepopulateWithInformalTaxonGroups) {
			return schemaFormat;
		}
		const species = (await this.apiClient.fetch("/taxa/MX.37600/species", {
			informalGroupFilters: prepopulateWithInformalTaxonGroups,
			selectedFields: "id,scientificName,vernacularName",
			lang: "fi",
			taxonRanks: "MX.species",
			onlyFinnish: true,
			pageSize: 1000
		})).results;
		return {
			...schemaFormat,
			options: {
				...schemaFormat.options,
				prepopulatedDocument: rjsf.utils.getDefaultFormState(
					schemaFormat.schema,
					merge((prepopulatedDocument || {}), {
						gatherings: [{
							units: species.map((s: any) => ({
								identifications: [{
									taxonID: s.id,
									taxonVerbatim: s.vernacularName || "",
									taxon: s.scientificName || ""
								}]
							}))
						}]
					},
					{arrayMerge: combineMerge}
					),
				)
			}
		};
	}
}

// From https://www.npmjs.com/package/deepmerge README
const combineMerge = (target: any, source: any, options: any) => {
	const destination = target.slice();

	source.forEach((item: any, index: number) => {
		if (typeof destination[index] === "undefined") {
			destination[index] = options.cloneUnlessOtherwiseSpecified(item, options);
		} else if (options.isMergeableObject(item)) {
			destination[index] = merge(target[index], item, options);
		} else if (target.indexOf(item) === -1) {
			destination.push(item);
		}
	});
	return destination;
};

const mapEmbeddable = (field: Field, properties: JSONSchemaE["properties"]) => {
	const required = field.fields?.reduce<string[]>((reqs, f) => {
		if (f.required) {
			reqs.push(unprefixProp(f.name));
		}
		return reqs;
	}, []);
	return JSONSchema.object(properties, {required});
};

const mapMaxOccurs = ({maxOccurs}: InternalProperty) => (schema: JSONSchemaE) =>
	maxOccurs === "unbounded" ? JSONSchema.array(schema) : schema;

const addTitle = (property: InternalProperty, lang: Lang) => (schema: any, field: Field) => {
	const title = property._rootProp
		? undefined
		: (field.label
			?? multiLang(property.label, lang)
			?? property.property
		);
	if (title !== undefined) {
		schema.title = title;
	}
	return schema;
};

const addDefault = (schema: any, field: Field) => {
	const _default = field.options?.default;
	if (_default !== undefined) {
		schema.default = _default;
	}
	return schema;
};

const filterList = (listName: string, white = true) => (schema: JSONSchemaE, field: Field) => {
	const list: string[] = (field.options || {} as any)[listName];

	if (!list) {
		return schema;
	}

	const indexedList = list.reduce<Record<string, number>>((index, e, idx) => {
		index[e] = idx;
		return index;
	}, {});

	const _check = (w: string) => indexedList[w] === undefined;
	const check = white ? _check : (w: string) => !_check(w);

	const schemaForEnum: any = schema.type === "string"
		? schema
		: schema.type === "array"
			? schema.items
			: undefined;

	if (schemaForEnum.enum) {
		[...schemaForEnum.enum].forEach((w: string) => {
			if (check(w) && schemaForEnum.enum && schemaForEnum.enumNames) {
				const idxInEnum = schemaForEnum.enum.indexOf(w);
				schemaForEnum.enum.splice(idxInEnum, 1);
				schemaForEnum.enumNames.splice(idxInEnum, 1);
			}
		});
	}

	return schema;
};

const filterWhitelist = filterList("whitelist");
const filterBlacklist = filterList("blacklist", false);

const hide = (schema: JSONSchemaE, field: Field) => {
	if (field.type === "hidden") {
		delete schema.enum;
		delete schema.enumNames;
	}
	return schema;
};

const addValueOptions = (schema: JSONSchemaE, field: Field) => {
	const {value_options} = field.options || {};
	if (!value_options) {
		return schema;
	}
	const [_enum, enumNames] = Object.keys(value_options).reduce<[string[], string[]]>(([_enum, enumNames], option) => {
		_enum.push(option);
		const label = value_options[option];
		enumNames.push(label);
		return [_enum, enumNames];
	}, [[], []]);
	const enumData = {
		enum: _enum,
		enumNames
	};
	return schema.type === "array"
		? { ...schema, items: {...(schema.items as any), ...enumData}, uniqueItems: true}
		: {...schema, ...enumData};
};

const addExcludeFromCopyToSchema = (schema: JSONSchemaE, field: Field) => {
	if (field.options?.excludeFromCopy) {
		(schema as any).excludeFromCopy = true;
	}
	return schema as JSONSchemaE;
};

const stringNumberLargerThan = (value: string, largerThan: number) =>
	!isNaN(parseInt(value)) && parseInt(value) > largerThan;

const addRequireds = (properties: Record<string, InternalProperty>) => (schema: JSONSchemaE) =>
	Object.keys((schema.properties as any)).reduce((schema, propertyName) => {
		const property = properties[unprefixProp(propertyName)];
		if (!property) {
			return schema;
		}
		const isRequired = (stringNumberLargerThan(property.minOccurs, 0) || property.required)
			&& !schema.required?.includes(property.shortName);
		if (isRequired) {
			if (!schema.required) {
				schema.required = [];
			}
			schema.required.push(property.shortName);
		}
		return schema;
	}, schema);

const optionsToSchema = (schema: JSONSchemaE, field: Field) =>
	field.options
		? (["uniqueItems", "minItems", "maxItems"] as (keyof FieldOptions)[]).reduce(
			(schema, prop) =>
				prop in (field.options as FieldOptions)
					? {...schema, [prop]: (field.options as FieldOptions)[prop]}
					: schema,
			schema)
		: schema;

const addValidators = (type: "validators" | "warnings") =>
	(schemaFormat: SchemaFormat & Pick<Master, "translations">, master: ExtendedMaster) => {
		const recursively = (field: Field, schema: JSONSchemaE, path: string) => {
			let validators: any = {};
			if (field[type]) {
				validators = field[type];
			}
			return field.fields
				? field.fields.reduce<any>((validators, field) => {
					const name = unprefixProp(field.name);
					const schemaForField = schema.type === "object"
						? (schema.properties as any)[name]
						: (schema as any).items.properties[name];
					const nextPath = `${path}/${name}`;
					const fieldValidators = recursively(field, schemaForField, nextPath);
					if (fieldValidators && Object.keys(fieldValidators).length) {
						let validatorsTarget: any;
						if (schema.type === "object") {
							validators.properties = validators.properties || {};
							validatorsTarget = validators.properties;
						} else if (schema.type === "array") {
							if (!validators.items) {
								validators.items = {};
							}
							if (!validators.items.properties) {
								validators.items.properties = {};
							}
							validatorsTarget = validators.items.properties;
						}
						validatorsTarget[name] = fieldValidators;
					}
					return validators;
				}, validators)
				: validators;
		};

		const validators = recursively({fields: master.fields, name: ""}, schemaFormat.schema, "");
		return {...schemaFormat, [type]: validators.properties || {}};
	};

const addAttributes = (schemaFormat: SchemaFormat, master: Master) => 
	typeof master.id === "string"
		? {
			...schemaFormat,
			attributes: {id: master.id}
		}
		: schemaFormat;

const addExcludeFromCopy = (schemaFormat: SchemaFormat) => {
	const exclude = (schema: any, path: string) => schema.excludeFromCopy ? [path] : [];
	const excludeRecursively = (schema: SchemaFormat["schema"], path: string): string[] => 
		[
			...exclude(schema, path),
			...(
				/* eslint-disable indent */
				schema.type === "array" ? excludeRecursively(schema.items, path + "[*]") :
				schema.type === "object" ? Object.keys(schema.properties).reduce(
					(excludeFromCopy, prop) => [
						...excludeFromCopy,
						...excludeRecursively(schema.properties[prop], path + "." + prop)
					], []) :
				[]
				/* eslint-enable indent */
			)
		];

	return {...schemaFormat, excludeFromCopy: excludeRecursively(schemaFormat.schema, "$")};
};

const addUiSchemaContext = (schemaFormat: SchemaFormat) => {
	if (!schemaFormat.extra) {
		return schemaFormat;
	}
	const uiSchemaContext = Object.keys(schemaFormat.extra).reduce<Record<string, {tree: AltTreeParent}>>(
		(uiSchemaContext, propName) => {
			const parentMap = schemaFormat.extra![propName].altParent;
			const rootNode: AltTreeParent = {children: {}, order: []};
			const nodes: Record<string, AltTreeNode> = {tree: rootNode};
			const root: {tree: AltTreeParent} = {tree: rootNode};
			Object.keys(parentMap).reduce<AltTreeParent>((tree, child) => {
				const parent = parentMap[child][0] || "tree";
				if (!nodes[parent]) {
					nodes[parent] = {children: {}, order: []};
				}
				if (!nodes[parent].children) {
					nodes[parent].children = {};
					nodes[parent].order = [];
				}
				if (!nodes[child]) {
					nodes[child] = {};
				}
				nodes[parent].children[child] = nodes[child];
				nodes[parent].order.push(child);
				return tree;
			}, root.tree);

			uiSchemaContext[propName] = root;
			return uiSchemaContext;
		}, {});
	return {...schemaFormat, uiSchemaContext};
};

const addLang = (language?: Lang) => (schemaFormat: SchemaFormat) =>
	language
		? {...schemaFormat, language}
		: schemaFormat;

export const removeTranslations = (language?: Lang) => (schemaFormat: SchemaFormat | Master) => {
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

const defaultGeometryValidator: DefaultValidator = {
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
				boundingBoxMaxHectares: 1000000
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

const addDefaultValidators = (master: ExtendedMaster) => {
	const recursively = (fields: Field[], path: string) => {
		fields.forEach(field => {
			const nextPath = `${path}/${unprefixProp(field.name)}`;
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
							if (!(translationKey in (master.translations as Translations)[lang])) {
								(master.translations as Translations)[lang][translationKey] =
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
