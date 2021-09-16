import MetadataService from "./metadata-service";
import { Field, JSONSchemaE, Lang, Master, PropertyModel } from "./model";
import { applyTransformations, JSONSchema, translate, unprefixProp } from "./utils";

const requiredHacks: Record<string, boolean> = {
	"MY.gatherings": false
};

const titleHacks: Record<string, string | undefined> = {
	"MY.gatherings": undefined
};

export default class FieldService {
	private metadataService: MetadataService;
	private lang: Lang;

	constructor(metadataService: MetadataService, lang: Lang) {
		this.metadataService = metadataService;
		this.lang = lang;
	}

	setLang(lang: Lang) {
		this.lang = lang;
	}

	masterToJSONSchema(master: Master) {
		const {fields, translations} = master;
		if (!fields) {
			return Promise.resolve({type: "object", properties: {}});
		}
		return this.fieldToSchema({name: "MY.document", type: "fieldset", fields: master.fields}, translations?.[this.lang], [{property: "MY.document", isEmbeddable: true, range: ["MY.document"]} as PropertyModel]);
	}

	fieldToSchema = (field: Field, translations: Record<string, string> | undefined, partOfProperties: PropertyModel[]): Promise<JSONSchemaE> => {
		const {name, options, validators, warnings, fields = []} = field;

		const property = partOfProperties.find(p => unprefixProp(p.property) === unprefixProp(field.name));
		if (!property) {
			throw new Error(`Bad field ${field}`);
		}

		const transformationsForAllTypes = [
			excludeFromCopy,
			optionsToSchema,
			addTitleAndDefault(property, translations)
		];

		if (property.isEmbeddable) {
			const propertiesPromise = fields
				? this.metadataService.getProperties(field.name)
				: Promise.resolve([] as PropertyModel[]);
			return propertiesPromise.then(properties => {
				return Promise.all(
					fields.map((field: Field) => this.fieldToSchema(field, translations, properties)
						.then(schema => Promise.resolve([field.name, schema] as [string, JSONSchemaE])))
				).then(schemaProperties =>
					applyTransformations(
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
					)
				);
			});
		} else {
			return applyTransformations<JSONSchemaE, Field>(this.metadataService.getJSONSchemaFromProperty(property), field, [
				filterWhitelist,
				...transformationsForAllTypes
			]);
		}
	};
}

const mapEmbeddable = (field: Field, properties: JSONSchemaE["properties"]) => {
	const required = field.fields?.reduce<string[]>((reqs, f) => {
		if (f.options?.required) {
			reqs.push(unprefixProp(f.name));
		}
		return reqs;
	}, []);
	return JSONSchema.object(properties, {required});
};

const mapMaxOccurs = ({maxOccurs}: PropertyModel) => (schema: JSONSchemaE) =>
	maxOccurs === "unbounded" ? JSONSchema.array(schema) : schema;

const addTitleAndDefault = (property: PropertyModel, translations?: Record<string, string>) => (schema: any, field: Field) => {
	const _default = field.options?.default;
	const title = property.property in titleHacks
		? titleHacks[property.property]
		: typeof field.label === "string"
			? translations
				? translate(field.label, translations)
				: field.label
			: property.label;
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


const excludeFromCopy = (schema: JSONSchemaE, field: Field) => {
	if (field.options?.excludeFromCopy) {
		(schema as any).excludeFromCopy = true;
	}
	return schema as JSONSchemaE;
};

const addRequireds = (properties: PropertyModel[]) => (schema: JSONSchemaE) => properties.reduce((schema, property) => {
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
		const {excludeFromCopy, whitelist, ...schemaOptions} = field.options; // eslint-disable-line @typescript-eslint/no-unused-vars
		return {...schema, ...schemaOptions} as JSONSchemaE;
	}
	return schema;
};
