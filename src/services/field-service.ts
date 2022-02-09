import ApiClient from "laji-form/lib/ApiClient";
import FormService from "./form-service";
import MetadataService from "./metadata-service";
import { Field, JSONSchemaE, Lang, Master, PropertyModel, SchemaFormat, Translations, Range, AltTreeNode, AltTreeParent,
	FieldOptions } from "../model";
import { applyTransformations, JSONSchema, multiLang, translate, unprefixProp, isObject } from "../utils";
import merge from "deepmerge";
import { applyPatch } from "fast-json-patch";

const requiredHacks: Record<string, boolean> = {
	"MY.gatherings": false
};

const titleHacks: Record<string, string | undefined> = {
	"gatherings": undefined,
	"identifications": undefined,
	"unitGathering": undefined,
	"unitFact": undefined,
	"geometry": undefined,
	"units": undefined
};

const classFieldNameToPropertyName = (name: string) => {
	const map: Record<string, string> = {
		"gatherings": "MY.gatherings",
		"gatheringEvent": "MZ.gatheringEvent",
		"units": "MY.units",
	};
	return map[name] || name;
};

export default class FieldService {
	private apiClient: ApiClient;
	private metadataService: MetadataService;
	private formService: FormService;
	private lang: Lang;

	constructor(apiClient: ApiClient, metadataService: MetadataService, formService: FormService, lang: Lang) {
		this.apiClient = apiClient;
		this.metadataService = metadataService;
		this.formService = formService;
		this.lang = lang;

		this.addTaxonSets = this.addTaxonSets.bind(this);
	}

	setLang(lang: Lang) {
		this.lang = lang;
	}

	async masterToSchemaFormat(master: Master, lang?: Lang): Promise<SchemaFormat> {
		master = await this.parseMaster(master);
		const rootField = master.fields
			? await this.getRootField(master.fields)
			: undefined;

		const schema = rootField
			? await this.masterToJSONSchema(master, rootField)
			: {};
		const {fields, "@type": _type, "@context": _context, ..._master} = master;
		const {translations, ...schemaFormat} = await applyTransformations(
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
				(schemaFormat) => schemaFormat.translations
					? translate(schemaFormat, schemaFormat.translations[this.lang])
					: schemaFormat
			]
		);
		return schemaFormat;
	}

	private async masterToJSONSchema(master: Master, rootField: Field): Promise<SchemaFormat["schema"]> {
		const {fields} = master;
		if (!fields || !fields.length) {
			return Promise.resolve({type: "object", properties: {}});
		}

		return this.fieldToSchema(
			{...rootField, fields},
			this.getRootProperty(rootField)
		);
	}

	private async getRootField(fields: Field[]): Promise<Field>  {
		// Try classes first that are known to be used.
		const order = ["MY.document", "MNP.namedPlace", "MAN.annotation", "MM.image", "MM.audio"];
		const classes = (await this.metadataService.getClasses()).sort((a, b) => {
			const indexA = order.indexOf(a.class);
			const indexB = order.indexOf(b.class);
			if (indexA >= 0 && indexB < 0) {
				return -1;
			}
			if (indexA < 0 && indexB >= 0) {
				return 1;
			}
			return indexA - indexB;
		});

		for (const c of classes) {
			const properties = await this.metadataService.getProperties(c.class);
			if (properties.some(prop =>
				(
					prop.domain.length === 1
					|| (prop.domain.length === 2 && prop.domain.every(d => d === "MM.image" || d === "MM.audio"))
				)
				&& fields.some(f => classFieldNameToPropertyName(f.name) === prop.property)
			)) {
				return {name: c.class, type: "fieldset"};
			}
		}
		throw new Error("Couldn't find root class");
	}

	private getRootProperty(rootField: Field): PropertyModel {
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

	private async fieldToSchema(
		field: Field,
		property: PropertyModel,
	): Promise<JSONSchemaE> {
		const {fields = []} = field;

		const transformationsForAllTypes = [
			addExcludeFromCopyToSchema,
			optionsToSchema,
			addTitleAndDefault(property, this.lang)
		];

		if (property.isEmbeddable) {
			const properties = fields
				? (await this.metadataService.getProperties(property.range[0]))
					.reduce<Record<string, PropertyModel>>((propMap, prop) => {
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
			return applyTransformations(
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
			return applyTransformations<JSONSchemaE, Field>(
				this.metadataService.getJSONSchemaFromProperty(property),
				field,
				[
					addValueOptions,
					filterWhitelist,
					filterBlacklist,
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

	private mapUnknownFieldWithTypeToProperty(field: Field): PropertyModel {
		if (!field.type) {
			throw new Error(`Bad field ${field.name}`);
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

	private parseMaster(master: Master) {
		return applyTransformations(master, undefined, [
			this.mapBaseForm,
			this.mapBaseFormFromFields,
			addDefaultValidators,
			this.applyPatches,
			this.addTaxonSets
		]);
	}

	private mapBaseForm = async (master: Master) => {
		if (!master.baseFormID) {
			return master;
		}
		const baseForm = await this.mapBaseForm(await this.formService.getMaster(master.baseFormID));
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
			const {formID} = f;
			if (!formID) {
				continue;
			}
			master.fields.splice(+idx, 1);
			const {fields, uiSchema, translations} = await this.parseMaster(await this.formService.getMaster(formID));
			master.translations = merge(translations || {}, master.translations || {});
			master.uiSchema = merge(master.uiSchema || {}, uiSchema || {});
			if (!fields) {
				continue;
			}
			master.fields = mergeFields(master.fields, fields);
		}
		return master;

		function mergeFields(fieldsFrom: Field[], fieldsTo: Field[]): Field[] {
			fieldsFrom.forEach(f => {
				const {name} = f;
				const exists = fieldsTo.find(f => f.name === name);
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
			const recursively = async (field: Field, property: PropertyModel) => {
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
							prop = this.mapUnknownFieldWithTypeToProperty(field);
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
}

const mapEmbeddable = (field: Field, properties: JSONSchemaE["properties"]) => {
	const required = field.fields?.reduce<string[]>((reqs, f) => {
		if (f.required) {
			reqs.push(unprefixProp(f.name));
		}
		return reqs;
	}, []);
	return JSONSchema.object(properties, {required});
};

const mapMaxOccurs = ({maxOccurs}: PropertyModel) => (schema: JSONSchemaE) =>
	maxOccurs === "unbounded" ? JSONSchema.array(schema) : schema;

const addTitleAndDefault = (property: PropertyModel, lang: Lang) => (schema: any, field: Field) => {
	const _default = field.options?.default;
	const title = typeof field.label === "string"
		? field.label
		: unprefixProp(property.property) in titleHacks
			? titleHacks[unprefixProp(property.property)]
			: multiLang(property.label, lang);
	if (title !== undefined) {
		schema.title = title;
	}
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

const addRequireds = (properties: Record<string, PropertyModel>) => (schema: JSONSchemaE) =>
	Object.keys((schema.properties as any)).reduce((schema, propertyName) => {
		const property = properties[unprefixProp(propertyName)];
		if (!property) {
			return schema;
		}
		const isRequired =
			!(property.property in requiredHacks && !requiredHacks[property.property])
			&& (
				requiredHacks[property.property]
				|| property.required && !schema.required?.includes(property.shortName)
			);
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
	(schemaFormat: SchemaFormat & Pick<Master, "translations">, master: Master) => {
		const recursively = (field: Field, schema: JSONSchemaE, path: string) => {
			let validators: any = {};
			if (field[type]) {
				validators = field[type];
			}
			return field.fields
				? field.fields.reduce<any>((validators, field) => {
					const schemaForField = schema.type === "object"
						? (schema.properties as any)[unprefixProp(field.name)]
						: (schema as any).items.properties[unprefixProp(field.name)];
					const nextPath = `${path}/${unprefixProp(field.name)}`;
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
						validatorsTarget[unprefixProp(field.name)] = fieldValidators;
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

const addDefaultValidators = (master: Master) => {
	const recursively = (fields: Field[], path: string) => {
		fields.forEach(field => {
			const nextPath = `${path}/${unprefixProp(field.name)}`;
			const _defaultValidators = defaultValidators[nextPath]?.["validators"];

			_defaultValidators && Object.keys(_defaultValidators).forEach(validatorName => {
				if (field.validators?.[validatorName]) {
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
