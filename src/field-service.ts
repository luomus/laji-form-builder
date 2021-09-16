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
		if (property.isEmbeddable) {
			const propertiesPromise = fields
				? this.metadataService.getProperties(field.name)
				: Promise.resolve([] as PropertyModel[]);
			return propertiesPromise.then(properties => {
				return Promise.all(
					fields.map((field: Field) => this.fieldToSchema(field, translations, properties)
						.then(schema => Promise.resolve([field.name, schema] as [string, JSONSchemaE])))
				).then(schemaProperties => {
					return applyTransformations(
						undefined, field, [
							(_, field) => mapEmbeddable(
								field,
								schemaProperties.reduce((ps, [name, schema]) => ({...ps, [unprefixProp(name)]: schema}), {}),
							),
							addRequireds(properties),
							mapMaxOccurs(property),
							addTitleAndDefault(property, translations),
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
	const origSchema = schema;
	const {enum: _enum, enumNames} = origSchema;
	return whitelist && _enum && enumNames
		? whitelist.reverse().reduce((schema, w) => { 
			const idx = _enum.indexOf(w);
			return idx !== -1
				? {...schema, enum: [...schema.enum, w], enumNames: [...schema.enumNames, enumNames[idx]]}
				: schema;
		}, {...schema, enum: [], enumNames: []})
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
