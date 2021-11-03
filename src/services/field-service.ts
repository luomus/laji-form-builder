import FormService from "./form-service";
import MetadataService from "./metadata-service";
import { Field, JSONSchemaE, Lang, Master, PropertyModel, SchemaFormat, Translations } from "../model";
import { applyTransformations, JSONSchema, multiLang, translate, unprefixProp } from "../utils";
import merge from "deepmerge";

const requiredHacks: Record<string, boolean> = {
	"MY.gatherings": false
};

const titleHacks: Record<string, string | undefined> = {
	"MY.gatherings": undefined,
	"MY.identifications": undefined,
	"MY.unitGathering": undefined,
	"MY.unitFact": undefined
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
		const {schema, excludeFromCopy} = await this.masterToJSONSchema(master);
		const {fields, ..._master} = master; // eslint-disable-line @typescript-eslint/no-unused-vars
		const {translations, ...schemaFormat} = ( // eslint-disable-line @typescript-eslint/no-unused-vars
			await applyTransformations({schema, excludeFromCopy, ..._master} as (SchemaFormat & Pick<Master, "translations">),
				master,
				[
					addValidators("validators"),
					addValidators("warnings"),
					(schemaFormat, master) => schemaFormat.translations ? translate(schemaFormat, schemaFormat.translations[this.lang]) : master
				]
			)
		);
		return schemaFormat;
	}

	private async masterToJSONSchema(master: Master): Promise<Pick<SchemaFormat, "schema" | "excludeFromCopy">> {
		const {fields, translations} = master;
		if (!fields) {
			return Promise.resolve({type: "object", properties: {}, excludeFromCopy: []});
		}
		const excludeFromCopy: string[] = [];
		return {
			schema: await this.fieldToSchema(
				{name: "MY.document", type: "fieldset", fields},
				translations?.[this.lang],
				[{property: "MY.document", isEmbeddable: true, range: ["MY.document"]} as PropertyModel],
				excludeFromCopy,
				"$"
			),
			excludeFromCopy
		};
	}

	private async fieldToSchema(
		field: Field,
		translations: Record<string, string> | undefined,
		partOfProperties: PropertyModel[],
		excludeFromCopy: string[],
		path: string
	): Promise<JSONSchemaE> {
		const {fields = []} = field;

		const property = partOfProperties.find(p => unprefixProp(p.property) === unprefixProp(field.name));
		if (!property) {
			throw new Error(`Bad field ${field}`);
		}

		const transformationsForAllTypes = [
			addExcludeFromCopy(excludeFromCopy, path),
			optionsToSchema,
			addTitleAndDefault(property, this.lang, translations)
		];

		const getExcludeFromCopyPath = (containerProperty: PropertyModel, path: string, field: Field) => {
			return `${path}${containerProperty.maxOccurs === "unbounded" ? "[*]" : ""}.${unprefixProp(field.name)}`;
		};

		if (property.isEmbeddable) {
			const properties = fields
				? (await this.metadataService.getProperties(field.name))
				: [];

			const schemaProperties = await Promise.all(
				fields.map(async (field: Field) => [field.name, await this.fieldToSchema(field, translations, properties, excludeFromCopy, getExcludeFromCopyPath(property, path, field))] as [string, JSONSchemaE])
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
				addValueOptions(translations),
				filterWhitelist,
				...transformationsForAllTypes
			]);
		}
	}

	private parseMaster(master: Master) {
		return this.mapBaseForm(master);
	}

	private async mapBaseForm(master: Master) {
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
		return master;
	}
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

const addTitleAndDefault = (property: PropertyModel, lang: Lang, translations?: Record<string, string>) => (schema: any, field: Field) => {
	const _default = field.options?.default;
	const title = property.property in titleHacks
		? titleHacks[property.property]
		: typeof field.label === "string"
			? translations
				? translate(field.label, translations)
				: field.label
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

const addValueOptions = (translations: Record<string, string> | undefined) => (schema: JSONSchemaE, field: Field) => {
	const {value_options} = field.options || {};
	if (!value_options) {
		return schema;
	}
	const [_enum, enumNames] = Object.keys(value_options).reduce<[string[], string[]]>(([_enum, enumNames], option) => {
		_enum.push(option);
		const label = value_options[option];
		enumNames.push(translations ? translate(label, translations) : label);
		return [_enum, enumNames];
	}, [[], []]);
	return {
		...schema,
		enum: _enum,
		enumNames
	};
};

const addExcludeFromCopy = (excludeFromCopy: string[], path: string) => (schema: JSONSchemaE, field: Field) => {
	if (field.options?.excludeFromCopy) {
		(schema as any).excludeFromCopy = true;
		excludeFromCopy.push(path);
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
		const {excludeFromCopy, whitelist, value_options, ...schemaOptions} = field.options; // eslint-disable-line @typescript-eslint/no-unused-vars
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
				const nextPath =  `${path}/${unprefixProp(field.name)}`;
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
