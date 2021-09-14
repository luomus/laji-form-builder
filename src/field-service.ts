import MetadataService from "./metadata-service";
import { Field, JSONSchemaE, Lang, Master, PropertyModel } from "./model";
import { applyTransformations, JSONSchema, translate, unprefixProp } from "./utils";

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
		const {name, options, validators, warnings, fields} = field;

		const property = partOfProperties.find(p => unprefixProp(p.property) === unprefixProp(field.name));
		if (!property) {
			throw new Error(`Bad field ${field}`);
		}
		if (property.isEmbeddable) {
			if (!fields) {
				return Promise.resolve(mapEmbeddable(field, {}, property));
			}
			return this.metadataService.getProperties(field.name).then(properties => {
				return Promise.all(
					fields.map((field: Field) => this.fieldToSchema(field, translations, properties)
						.then(schema => Promise.resolve([field.name, schema] as [string, JSONSchemaE])))
				).then(schemaProperties => {
					return applyTransformations(
						undefined as unknown as JSONSchemaE, field, [
							(_, field) => mapEmbeddable(
								field,
								schemaProperties.reduce((ps, [name, schema]) => ({...ps, [unprefixProp(name)]: schema}), {}),
								property
							),
							addTitleAndDefault(property, translations)
						]
					);
				});
			});
		} else {
			return this.metadataService.getJSONSchemaFromProperty(property).then(schema => 
				applyTransformations(schema, field, [
					filterWhitelist,
					excludeFromCopy,
					addTitleAndDefault(property, translations)
				])
			);
		}
	};
}

const mapEmbeddable = (field: Field, properties: JSONSchemaE["properties"], {maxOccurs}: PropertyModel) => {
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

const addTitleAndDefault =
	(property: PropertyModel, translations?: Record<string, string>) =>
	(schema: any, field: Field) => {
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
	const origSchema: JSONSchemaE = schema;
	return whitelist && origSchema.enum && origSchema.enumNames
		? whitelist.reverse().reduce((schema, w) => { 
			const idx = origSchema.enum!.indexOf(w);
			return idx !== -1
				? {...schema, enum: [...schema.enum, w], enumNames: [...schema.enumNames, origSchema.enumNames![idx]]}
				: schema;
		}, {...schema, enum: [], enumNames: []})
		: schema;
};

const excludeFromCopy = (schema: JSONSchemaE, field: Field) => {
	if (field.options?.excludeFromCopy) {
		(schema as any).excludeFromCopy = true;
	}
	return schema as JSONSchemaE;
}
