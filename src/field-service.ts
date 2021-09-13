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
		return fieldToSchema({name: "MY.document", type: "fieldset", fields: master.fields}, translations?.[this.lang], [{property: "MY.document"} as PropertyModel], this.metadataService);
	}
}

const mapPropertyFieldsetOrCollection = (field: Field, properties: any) => {
	const required = field.fields?.reduce<string[]>((reqs, f) => {
		if (f.options?.required) {
			reqs.push(unprefixProp(f.name));
		}
		return reqs;
	}, []);
	const objectSchema = JSONSchema.object(properties, {required});
	return field.type === "fieldset" ? objectSchema : JSONSchema.array(objectSchema);
};

const addTitleAndDefault = (schema: any, field: Field, property: Pick<PropertyModel, "label">, translations?: Record<string, string>) => {
	const _default = field.options?.default;
	const title = typeof field.label === "string"
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
	if (field.type === "fieldset" || field.type === "collection") {
		if (!fields) {
			return Promise.resolve(mapPropertyFieldsetOrCollection(field, {}));
		}
		return metadataService.getProperties(field.name).then(properties => {
			return Promise.all(
				fields.map((field: Field) => fieldToSchema(field, translations, properties, metadataService)
					.then(schema => Promise.resolve([field.name, schema])))
			).then(schemaProperties => {
				return addTitleAndDefault(mapPropertyFieldsetOrCollection(
					field,
					schemaProperties.reduce((ps, [name, schema]) => ({...ps, [unprefixProp(name)]: schema}), {})
				), field, property, translations);
			});
		});
	} else {
		return metadataService.getJSONSchemaFromProperty(property).then((schema) => {
			schema = filterWhitelist(schema, field);
			schema = excludeFromCopy(schema, field);
			return addTitleAndDefault(schema, field, property, translations);
		});
	}
};
