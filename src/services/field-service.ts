import FormService from "./form-service";
import MetadataService from "./metadata-service";
import { Field, JSONSchemaE, Lang, Master, PropertyModel, SchemaFormat, Translations, Range, AltTreeNode, AltTreeParent } from "../model";
import { applyTransformations, JSONSchema, multiLang, translate, unprefixProp } from "../utils";
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
	"geometry": undefined
};

export default class FieldService {
	private metadataService: MetadataService;
	private formService: FormService;
	private lang: Lang;

	constructor(metadataService: MetadataService, formService: FormService, lang: Lang) {
		this.metadataService = metadataService;
		this.formService = formService;
		this.lang = lang;
	}

	setLang(lang: Lang) {
		this.lang = lang;
	}

	async masterToSchemaFormat(master: Master): Promise<SchemaFormat> {
		master = await this.parseMaster(master);
		const rootField = await this.getRootField(master.fields as Field[]);

		const schema = await this.masterToJSONSchema(master, rootField);
		const {fields, "@type": _type, "@context": _context, ..._master} = master; // eslint-disable-line @typescript-eslint/no-unused-vars
		const {translations, ...schemaFormat} = ( // eslint-disable-line @typescript-eslint/no-unused-vars
			await applyTransformations({schema, excludeFromCopy: [], ..._master} as (SchemaFormat & Pick<Master, "translations">),
				master,
				[
					addValidators("validators"),
					addValidators("warnings"),
					addAttributes,
					addExcludeFromCopy,
					this.addExtra({...rootField, fields: master.fields}),
					addUiSchemaContext,
					(schemaFormat) => schemaFormat.translations ? translate(schemaFormat, schemaFormat.translations[this.lang]) : schemaFormat
				]
			)
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
				(prop.domain.length === 1 || (prop.domain.length === 2 && prop.domain.every(d => d === "MM.image" || d === "MM.audio")))
				&& fields.some(f => f.name === prop.property)
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
				? (await this.metadataService.getProperties(field.name)).reduce<Record<string, PropertyModel>>((propMap, prop) => {
					if (fields.some(f => unprefixProp(prop.property) === unprefixProp(f.name))) {
						propMap[unprefixProp(prop.property)] = prop;
					}
					return propMap;
				}, {})
				: {};

			const schemaProperties = await Promise.all(
				fields.map(async (field: Field) => {
					const prop = properties[unprefixProp(field.name)];
					if (!prop) {
						throw new Error(`Bad field ${field.name}`);
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
			return applyTransformations<JSONSchemaE, Field>(this.metadataService.getJSONSchemaFromProperty(property), field, [
				addValueOptions,
				filterWhitelist,
				...transformationsForAllTypes
			]);
		}
	}

	private parseMaster(master: Master) {
		return applyTransformations(master, undefined, [
			this.mapBaseForm,
			this.mapBaseFormFromFields,
			this.applyPatches,
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
					const properties = await this.metadataService.getProperties(field.name);
					for (const _field of field.fields) {
						const prop = properties.find(p => unprefixProp(p.property) === unprefixProp(_field.name));
						if (!prop) {
							throw new Error(`Bad field ${_field.name}`);
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

const filterWhitelist = (schema: JSONSchemaE, field: Field) => {
	const {whitelist} = field.options || {};

	if (!whitelist) {
		return schema;
	}

	const indexedWhitelist = whitelist.reduce<Record<string, number>>((index, e, idx) => {
		index[e] = idx;
		return index;
	}, {});

	return whitelist && schema.enum
		? [...schema.enum].reduce((schema, w: string) => {
			if (indexedWhitelist[w] === undefined && schema.enum && schema.enumNames) {
				const idxInEnum = schema.enum.indexOf(w);
				schema.enum.splice(idxInEnum, 1);
				schema.enumNames.splice(idxInEnum, 1);
			}
			return schema;
		}, schema)
		: schema;
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

const addRequireds = (properties: Record<string, PropertyModel>) => (schema: JSONSchemaE) => Object.keys((schema.properties as any)).reduce((schema, propertyName) => {
	const property = properties[unprefixProp(propertyName)];
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

const optionsToSchema = (schema: JSONSchemaE, field: Field) => {
	if (field.options) {
		const {excludeFromCopy, whitelist, value_options, target_element, ...schemaOptions} = field.options; // eslint-disable-line @typescript-eslint/no-unused-vars
		return {...schema, ...schemaOptions} as JSONSchemaE;
	}
	return schema;
};

const addValidators = (type: "validators" | "warnings") => (schemaFormat: SchemaFormat & Pick<Master, "translations">, master: Master) => {
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
				const fieldValidators = addDefaultValidators(recursively(field, schemaForField, nextPath), nextPath);
				if (fieldValidators && Object.keys(fieldValidators).length) {
					let validatorsTarget: any;
					if (schema.type === "object") {
						validators.properties = validators.properties || {};
						validatorsTarget = validators.properties;
					} else if (schema.type === "array") {
						validators.items = validators.items || {properties: {}};
						validatorsTarget = validators.items.properties;
					}
					validatorsTarget[unprefixProp(field.name)] = fieldValidators;
				}
				return validators;
			}, validators)
			: validators;
	};

	const addDefaultValidators = (validators: SchemaFormat["validators"] | SchemaFormat["warnings"], path: string) => {
		const _defaultValidators = defaultValidators[path]?.[type];
		if (!_defaultValidators) {
			return validators;
		}
		return Object.keys(_defaultValidators).reduce((validators, validatorName) => {
			const defaultValidator = _defaultValidators[validatorName];
			if (!validators[validatorName]) {
				if (defaultValidator.translations) {
					schemaFormat.translations = {
						...(schemaFormat.translations || {}),
						fi: (schemaFormat.translations?.fi || {}),
						sv: (schemaFormat.translations?.sv || {}),
						en: (schemaFormat.translations?.en || {}),
					};
					Object.keys(defaultValidator.translations).forEach(translationKey => {
						Object.keys(defaultValidator.translations[translationKey]).forEach((lang: Lang) => {
							(schemaFormat.translations as Translations)[lang][translationKey] = defaultValidator.translations[translationKey][lang];
						});
					});
				}
				return {...validators, [validatorName]: defaultValidator.validator};
			}
			return validators;
		}, validators);
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
					(excludeFromCopy, prop) => [...excludeFromCopy, ...excludeRecursively(schema.properties[prop], path + "." + prop)], []) :
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
const defaultValidators: {[propName: string]: DefaultValidator} = {
	"/gatherings/geometry": defaultGeometryValidator
};
