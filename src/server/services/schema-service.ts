import MetadataService from "../../services/metadata-service";
import { AltTreeNode, AltTreeParent, ExpandedMaster, Field, FieldOptions, JSONSchema, JSONSchemaEnumOneOf,
	JSONSchemaObject, JSONSchemaV6Enum, Lang, Master, Property, SchemaFormat } from "../../model";
import { mapUnknownFieldWithTypeToProperty } from "./field-service";
import { dictionarify, JSONSchemaBuilder, multiLang, reduceWith, unprefixProp } from "../../utils";
import { getDefaultFormState } from "laji-form/lib/utils";
import merge from "deepmerge";
import ConverterService from "./converter-service";
import ApiClient from "../../api-client";

export default class SchemaService<T extends (JSONSchemaEnumOneOf | JSONSchemaV6Enum) = JSONSchemaEnumOneOf>
	extends ConverterService<SchemaFormat<T>> {

	metadataService: MetadataService;
	apiClient: ApiClient;
	lang: Lang;
	useEnums = false;

	constructor(metadataService: MetadataService, apiClient: ApiClient, lang: Lang, useEnums = false) {
		super(metadataService);
		this.metadataService = metadataService;
		this.apiClient = apiClient;
		this.lang = lang;
		this.useEnums = useEnums;

		this.prepopulate = this.prepopulate.bind(this);
	}

	setLang(lang: Lang) {
		this.lang = lang;
	}

	async convert(master: ExpandedMaster, rootField?: Field, rootProperty?: Property) {
		const schema = rootField && rootProperty
			? await this.fieldToSchema({...rootField, fields: master.fields || []}, rootProperty, true)
			: JSONSchemaBuilder.object();
		const {fields, "@type": _type, "@context": _context, ..._master} = master;
		return reduceWith(
			{
				schema,
				uiSchema: {},
				excludeFromCopy: [],
				..._master
			},
			master,
			addValidators("validators"),
			addValidators("warnings"),
			addAttributes,
			addExcludeFromCopy,
			addUiSchemaContext,
			this.prepopulate
		);
	}

	async fieldToSchema(field: Field, property: Property, isRootProperty = false)
	: Promise<JSONSchema<T>> {
		const {fields = []} = field;

		let transformed: JSONSchema<T>;
		if (property.isEmbeddable) {
			const properties = await this.getProperties(fields, property);

			const schemaProperties = await Promise.all(
				fields.map(async field => {
					let prop = properties[field.name];
					if (!prop) {
						prop = mapUnknownFieldWithTypeToProperty(field);
					}
					return [
						field.name,
						await this.fieldToSchema(field, prop, false)
					] as [string, JSONSchema<T>];
				})
			);

			transformed = await reduceWith(
				mapEmbeddable(
					field,
					schemaProperties.reduce((ps, [name, schema]) => ({...ps, [name]: schema}), {}),
				),
				field,
				addRequireds(properties),
				mapMaxOccurs(property)
			) as JSONSchema<T>;
		} else {
			transformed = await reduceWith(
				this.metadataService.getJSONSchemaFromProperty(property, this.useEnums),
				field,
				addValueOptions(this.useEnums),
				filterWhitelist(this.useEnums),
				filterBlacklist(this.useEnums),
				hide(this.useEnums)
			) as JSONSchema<T>;
		}

		return reduceWith(
			transformed, 
			field,
			optionsToSchema,
			addTitle(property, this.lang, isRootProperty),
			addDefault
		);

	}

	private async prepopulate<T extends Pick<SchemaFormat, "schema" | "options">>(schemaFormat: T) {
		const {prepopulatedDocument, prepopulateWithInformalTaxonGroups} = schemaFormat.options || {};
		if (!prepopulateWithInformalTaxonGroups) {
			return schemaFormat;
		}
		const BIOTA = "MX.37600";
		const species = (await this.apiClient.fetchJSON(`/taxa/${BIOTA}/species`, {
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
				prepopulatedDocument: getDefaultFormState(
					schemaFormat.schema as any,
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

const optionsToSchema = <T extends JSONSchema>(schema: T, field: Field) =>
	field.options
		? (["uniqueItems", "minItems", "maxItems"] as (keyof FieldOptions)[]).reduce(
			(schema, prop) =>
				prop in (field.options as FieldOptions)
					? {...schema, [prop]: (field.options as FieldOptions)[prop]}
					: schema,
			schema)
		: schema;

const addTitle = (property: Property, lang: Lang, isRootProperty = false) => (schema: any, field: Field) => {
	const title = isRootProperty
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

const mapEmbeddable = (field: Field, properties: JSONSchemaObject["properties"]) => {
	const required = field.fields?.reduce<string[]>((reqs, f) => {
		if (f.required) {
			reqs.push(f.name);
		}
		return reqs;
	}, []);
	return JSONSchemaBuilder.object(properties, {required});
};

const mapMaxOccurs = ({maxOccurs}: Property) =>
	<T extends (JSONSchemaEnumOneOf | JSONSchemaV6Enum)>(schema: JSONSchema<T>) =>
		maxOccurs === "unbounded" ? JSONSchemaBuilder.array(schema) : schema;

const stringNumberLargerThan = (value: string, largerThan: number) =>
	!isNaN(parseInt(value)) && parseInt(value) > largerThan;

const addRequireds = (properties: Record<string, Property>) =>
	<T extends (JSONSchemaEnumOneOf | JSONSchemaV6Enum)>(schema: JSONSchemaObject<T>) =>
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

const addValueOptions = (useEnums = false) =>
	<T extends JSONSchemaEnumOneOf | JSONSchemaV6Enum>(schema: JSONSchema<T>, field: Field) => {
		const {value_options} = field.options || {};
		if (!value_options) {
			return schema;
		}
		const [_enum, enumNames] = Object.keys(value_options).reduce<[string[], string[]]>(
			([_enum, enumNames], option) => {
				_enum.push(option);
				const label = value_options[option];
				enumNames.push(label);
				return [_enum, enumNames];
			}, [[], []]);
		const {type, ...enumData} = JSONSchemaBuilder.enu({
			enum: _enum,
			enumNames
		}, undefined, useEnums);
		return schema.type === "array"
			? { ...schema, items: {...(schema.items as any), ...enumData}, uniqueItems: true}
			: {...schema, ...enumData};
	};

const filterList = (listName: "whitelist" | "blacklist", white = true, useEnums = false) =>
	<T extends JSONSchemaEnumOneOf | JSONSchemaV6Enum>(schema: JSONSchema<T>, field: Field) => {
		const list = (field.options || {} as FieldOptions)[listName];

		if (!list) {
			return schema;
		}

		const dict = dictionarify(list);
		const _check = (w: string) => !dict[w];
		const check = white ? _check : (w: string) => !_check(w);

		const schemaForEnum: any = schema.type === "string"
			? schema
			: schema.type === "array"
				? schema.items
				: undefined;

		if (!schemaForEnum || (!schemaForEnum.enum && !schemaForEnum.oneOf)) {
			return schema;
		}

		const enu: string[] =
			(useEnums
				? schemaForEnum.enum
				: (schemaForEnum.oneOf as JSONSchemaEnumOneOf["oneOf"])?.map(item => (item as any).const)
			) || [];

		[...enu].forEach((w: string) => {
			if (!check(w)) {
				return;
			}
			if (useEnums) {
				const idxInEnum = schemaForEnum.enum.indexOf(w);
				schemaForEnum.enum.splice(idxInEnum, 1);
				schemaForEnum.enumNames.splice(idxInEnum, 1);
			} else {
				const idxInEnum = schemaForEnum.oneOf.findIndex((one: any) => one.const === w);
				schemaForEnum.oneOf.splice(idxInEnum, 1);
			}
		});

		return schema;
	};

const filterWhitelist = (useEnums = false) => filterList("whitelist", true, useEnums);
const filterBlacklist = (useEnums = false) => filterList("blacklist", false, useEnums);

const hide = (useEnums = false) =>
	<T extends (JSONSchemaEnumOneOf | JSONSchemaV6Enum)>(schema: JSONSchema<T>, field: Field) => {
		if (field.type !== "hidden") {
			return schema;
		}
		if (useEnums) {
			delete (schema as any).enum;
			delete (schema as any).enumNames;
		} else {
			delete (schema as any).oneOf;
		}
		return schema;
	};

type EnumType = JSONSchemaEnumOneOf | JSONSchemaV6Enum;

type AddValidatorsInput<T extends EnumType> = Pick<SchemaFormat<T>, "schema"> & Pick<Master, "translations">;

function addValidators<P extends EnumType, T extends AddValidatorsInput<P>>(type: "validators")
	: ((schemaFormat: T, master: ExpandedMaster) => T & {validators: any})
function addValidators<P extends EnumType, T extends AddValidatorsInput<P>>(type: "warnings")
	: ((schemaFormat: T, master: ExpandedMaster) => T & {warnings: any})
function addValidators<P extends EnumType, T extends AddValidatorsInput<P>>(type: "validators" | "warnings")
	: ((schemaFormat: T, master: ExpandedMaster) => T & {validators?: any, warnings?: any})
{
	return (schemaFormat: T, master: ExpandedMaster) => {
		const recursively = (field: Field, schema: JSONSchema, path: string) => {
			let validators: any = {};
			if (field[type]) {
				validators = field[type];
			}
			return field.fields
				? field.fields.reduce<any>((validators, field) => {
					const {name} = field;
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
}

const addAttributes = <T extends Record<string, unknown>>(schemaFormat: T, master: Master)
	: T & {attributes?: {id: string}} => 
		typeof master.id === "string"
			? {
				...schemaFormat,
				attributes: {id: master.id}
			}
			: schemaFormat;

const addExcludeFromCopy = <T extends {schema: JSONSchema<JSONSchemaEnumOneOf | JSONSchemaV6Enum>}>
	(schemaFormat: T, master: ExpandedMaster) => {
	const exclude = (field: Pick<Field, "fields" | "options">, path: string) =>
		field.options?.excludeFromCopy ? [path] : [];
	const excludeRecursively = (
		field: Pick<Field, "fields" | "options">,
		schema: JSONSchema<JSONSchemaEnumOneOf | JSONSchemaV6Enum>,
		path: string
	) : string[] => 
		[
			...exclude(field, path),
			...(
				field.fields
					? field.fields.reduce((excludeFromCopy, field) => [
						...excludeFromCopy,
						...excludeRecursively(field,
							schema.type === "array"
								? (schema.items as any).properties[field.name]
								: (schema as JSONSchemaObject).properties[field.name],
							schema.type === "array"
								? path + "[*]." + field.name
								: path + "." + field.name
						)
					], [])
					: []
			)
		];

	return {
		...schemaFormat, excludeFromCopy: master.fields
			? excludeRecursively({fields: master.fields}, schemaFormat.schema, "$")
			: []
	};
};

const addUiSchemaContext = <T extends Pick<SchemaFormat, "extra">>(schemaFormat: T)
	: T & {uiSchemaContext?: Record<string, {tree: AltTreeParent}>} => {
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

