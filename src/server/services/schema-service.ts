import ApiClient from "laji-form/lib/ApiClient";
import MetadataService from "../../services/metadata-service";
import { AltTreeNode, AltTreeParent, ExpandedMaster, Field, FieldOptions, JSONSchemaE, Lang, Master, SchemaFormat
} from "../../model";
import { InternalProperty, mapUnknownFieldWithTypeToProperty } from "./field-service";
import { dictionarify, JSONSchema, multiLang, reduceWith, unprefixProp } from "../../utils";
import * as rjsf from "@rjsf/core";
import merge from "deepmerge";
import ConverterService from "./converter-service";

export default class SchemaService extends ConverterService<SchemaFormat> {
	metadataService: MetadataService;
	apiClient: ApiClient;
	lang: Lang;
	constructor(metadataService: MetadataService, apiClient: ApiClient, lang: Lang) {
		super(metadataService);
		this.metadataService = metadataService;
		this.apiClient = apiClient;
		this.lang = lang;

		this.prepopulate = this.prepopulate.bind(this);
	}

	setLang(lang: Lang) {
		this.lang = lang;
	}

	async convert(master: ExpandedMaster, rootField?: Field, rootProperty?: InternalProperty) {
		const schema = rootField && rootProperty
			? await this.fieldToSchema(
				{...rootField, fields: master.fields || []},
				rootProperty
			)
			: JSONSchema.object();
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
				addUiSchemaContext,
				this.prepopulate,
			]
		);
	}

	async fieldToSchema(field: Field, property: InternalProperty): Promise<JSONSchemaE> {
		const {fields = []} = field;

		const transformationsForAllTypes = [
			addExcludeFromCopyToSchema,
			optionsToSchema,
			addTitle(property, this.lang),
			addDefault
		];

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
						await this.fieldToSchema(field, prop)
					] as [string, JSONSchemaE];
				})
			);

			return reduceWith(
				mapEmbeddable(
					field,
					schemaProperties.reduce((ps, [name, schema]) => ({...ps, [name]: schema}), {}),
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

const addExcludeFromCopyToSchema = (schema: JSONSchemaE, field: Field) => {
	if (field.options?.excludeFromCopy) {
		(schema as any).excludeFromCopy = true;
	}
	return schema as JSONSchemaE;
};

const optionsToSchema = (schema: JSONSchemaE, field: Field) =>
	field.options
		? (["uniqueItems", "minItems", "maxItems"] as (keyof FieldOptions)[]).reduce(
			(schema, prop) =>
				prop in (field.options as FieldOptions)
					? {...schema, [prop]: (field.options as FieldOptions)[prop]}
					: schema,
			schema)
		: schema;

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

const mapEmbeddable = (field: Field, properties: JSONSchemaE["properties"]) => {
	const required = field.fields?.reduce<string[]>((reqs, f) => {
		if (f.required) {
			reqs.push(f.name);
		}
		return reqs;
	}, []);
	return JSONSchema.object(properties, {required});
};

const mapMaxOccurs = ({maxOccurs}: InternalProperty) => (schema: JSONSchemaE) =>
	maxOccurs === "unbounded" ? JSONSchema.array(schema) : schema;

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

const filterList = (listName: "whitelist" | "blacklist", white = true) => (schema: JSONSchemaE, field: Field) => {
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

const addValidators = (type: "validators" | "warnings") =>
	(schemaFormat: SchemaFormat & Pick<Master, "translations">, master: ExpandedMaster) => {
		const recursively = (field: Field, schema: JSONSchemaE, path: string) => {
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

