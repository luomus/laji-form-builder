import MetadataService from "./metadata-service";
import { Field, Lang, Master, PropertyModel } from "./model";
import { JSONSchema, translate, unprefixProp } from "./utils";

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
		return fieldToSchema({name: "MY.document", type: "fieldset", fields: master.fields}, translations?.[this.lang], [{property: "MY.document", isEmbeddable: true, range: ["MY.document"]} as PropertyModel], this.metadataService);
	}
}

const mapEmbeddable = (field: Field, properties: any, {maxOccurs}: PropertyModel) => {
	const required = field.fields?.reduce<string[]>((reqs, f) => {
		if (f.options?.required) {
			reqs.push(unprefixProp(f.name));
		}
		return reqs;
	}, []);
	const objectSchema = JSONSchema.object(properties, {required});
	return maxOccurs === "unbounded" ? JSONSchema.array(objectSchema) : objectSchema
};

const titleHacks: Record<string, string | undefined> = {
	"MY.gatherings": undefined
};

const addTitleAndDefault = (schema: any, field: Field, property: Pick<PropertyModel, "label" | "property">, translations?: Record<string, string>) => {
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

const filterWhitelist = (schema: any, field: Field) => {
	const {whitelist} = field.options || {};
	const origSchema = schema;
	return whitelist
		? whitelist.reverse().reduce((schema, w) => {
			const idx = origSchema.enum.indexOf(w);
			return idx !== -1
				? {...schema, enum: [...schema.enum, w], enumNames: [...schema.enumNames, origSchema.enumNames[idx]]}
				: schema;
		}, {...schema, enum: [], enumNames: []})
		: schema;
};

const excludeFromCopy = (schema: any, field: Field) => {
	if (field.options?.excludeFromCopy) {
		schema.excludeFromCopy = true;
	}
	return schema;
}

const fieldToSchema = (field: Field, translations: Record<string, string> | undefined, partOfProperties: PropertyModel[], metadataService: MetadataService): Promise<any> => {
	const {name, options, validators, warnings, fields} = field;

	const property = partOfProperties.find(p => unprefixProp(p.property) === unprefixProp(field.name));
	if (!property) {
		throw new Error(`Bad field ${field}`);
	}
	if (property.isEmbeddable) {
		if (!fields) {
			return Promise.resolve(mapEmbeddable(field, {}, property));
		}
		return metadataService.getProperties(field.name).then(properties => {
			return Promise.all(
				fields.map((field: Field) => fieldToSchema(field, translations, properties, metadataService)
					.then(schema => Promise.resolve([field.name, schema])))
			).then(schemaProperties => {
				return addTitleAndDefault(mapEmbeddable(
					field,
					schemaProperties.reduce((ps, [name, schema]) => ({...ps, [unprefixProp(name)]: schema}), {}),
					property
				), field, property, translations);
			});
		});
	} else {
		return metadataService.getJSONSchemaFromProperty(property).then((schema) => {
			schema = filterWhitelist(schema, field);
			schema = excludeFromCopy(schema, field);
			if (schema.type === "object" || schema.type === "array") {
				if (!fields) {
					Promise.resolve(mapEmbeddable(field, {}, property));
				}

			}
			return addTitleAndDefault(schema, field, property, translations);
		});
	}
};
