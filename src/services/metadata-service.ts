import ApiClient from "../api-client";
import { Property, PropertyContext, PropertyRange, Range, Lang, Class, JSONSchema, Field } from "../model";
import { reduceWith, fetchJSON, JSONSchemaBuilder, multiLang, unprefixProp } from "../utils";
import UsesMemoization from "./uses-memoization";

export default class MetadataService extends UsesMemoization {
	private apiClient: ApiClient;
	private lang: Lang;
	private allRanges: Record<string, Range[]> | undefined;

	constructor(apiClient: ApiClient, lang: Lang) {
		super();
		this.apiClient = apiClient;
		this.lang = lang;
	}

	flush() {
		super.flush();
		this.allRanges = undefined;
	}

	setLang(lang: Lang) {
		this.lang = lang;
	}

	getPropertiesContextFor = this.memoize((context: string) => 
		fetchJSON<{"@context": Record<string, PropertyContext>}>(`https://schema.laji.fi/context/${context}.jsonld`)
			.then(result => result["@context"]))

	getPropertiesForEmbeddedProperty = this.memoize(
		async (property: string, lang = "multi", signal?: AbortSignal): Promise<Property[]> => 
			(await this.apiClient.fetchJSON(
				`/metadata/classes/${unprefixProp(property)}/properties`,
				{lang},
				{signal})
			).results as Property[]
		, { length: 2 })

	async getProperties(fields: Field[], property: Property, signal?: AbortSignal) {
		return fields
			? (await this.getPropertiesForEmbeddedProperty(property.range[0], undefined, signal))
				.reduce<Record<string, Property>>((propMap, prop) => {
					if (fields.some(f => unprefixProp(prop.property) === unprefixProp(f.name))) {
						propMap[unprefixProp(prop.property)] = prop;
					}
					return propMap;
				}, {})
			: {};
	}

	getRange = this.memoize((property: string): Promise<Range[]> =>
		this.allRanges && Promise.resolve(this.allRanges[property])
		|| this.apiClient.fetchJSON(
			// eslint-disable-next-line max-len
			`/metadata/ranges/${unprefixProp(property)}`,
			{lang: "multi"}
		)
	)

	getAllRanges = async () => {
		if (this.allRanges) {
			return this.allRanges;
		}
		const ranges = await (
			this.apiClient.fetchJSON("/metadata/ranges", {lang: "multi"}) as Promise<Record<string, Range[]>>
		);
		this.allRanges = ranges;
		return ranges;
	}

	isAltRange = async (range: string) => !!(await this.getAllRanges())[range];

	getJSONSchemaFromProperty<T extends JSONSchema>(property: Property): Promise<T> {
		const mapRangeToSchema = async (property: Property): Promise<T> => {
			const range = property.range[0];
			const isRange = await this.isAltRange(range);
			if (isRange) {
				const _enums = await this.getRange(range);
				const empty = property.minOccurs === "1" ? [] : [""];
				let enums = [...empty], enumNames = [...empty];
				for (const e of _enums) {
					enums.push(e.id);
					enumNames.push(
						e.vernacularName?.[this.lang] !== undefined
							? e.vernacularName[this.lang] as string
							: e.value?.[this.lang] !== undefined
								? e.value[this.lang] as string
								: e.id
					);
				}
				return JSONSchemaBuilder.enu({enum: enums, enumNames}, undefined) as T;
			}
			if (property.multiLanguage) {
				return JSONSchemaBuilder.object(["fi", "sv", "en"].reduce((props, lang) =>
					({...props, [lang]: {type: "string"}}),
				{})) as T;
			}
			let schema;
			switch (range) {
			case PropertyRange.String:
				schema = JSONSchemaBuilder.String();
				break;
			case PropertyRange.Boolean:
				schema = JSONSchemaBuilder.Boolean();
				break;
			case PropertyRange.Int:
				schema = JSONSchemaBuilder.Integer();
				break;
			case PropertyRange.NonNegativeInteger:
				schema = JSONSchemaBuilder.Integer({minimum: 0});
				break;
			case PropertyRange.PositiveInteger:
				schema = JSONSchemaBuilder.Integer({exclusiveMinimum: 0});
				break;
			case PropertyRange.Decimal:
				schema = JSONSchemaBuilder.Number();
				break;
			case PropertyRange.DateTime:
				schema = JSONSchemaBuilder.String({format: "date-time"});
				break;
			case PropertyRange.keyValue:
			case PropertyRange.keyAny:
				schema = JSONSchemaBuilder.object();
				break;
			default:
				if (!property.isEmbeddable && unprefixProp(property.property) !== "geometry") {
					schema = JSONSchemaBuilder.String();
				} else {
					return propertiesToSchema(await this.getPropertiesForEmbeddedProperty(range));
				}
			}
			return schema as T;
		};

		const mapMaxOccurs = (schema: T, {maxOccurs}: Property) =>
			maxOccurs === "unbounded"
				? JSONSchemaBuilder.array(schema)
				: schema;

		const mapUniqueItemsForUnboundedAlt = async (schema: T, {range, maxOccurs}: Property) =>
			(await this.isAltRange(range[0])) && maxOccurs === "unbounded"
				? {...schema, uniqueItems: true}
				: schema;

		const mapLabel = (schema: T, {label}: Property) =>
			({...schema, title: multiLang(label, this.lang)});

		const mapPropertyToJSONSchema = (property: Property): Promise<T> =>
			reduceWith(
				mapRangeToSchema(property),
				property, 
				mapMaxOccurs,
				mapUniqueItemsForUnboundedAlt,
				mapLabel
			);

		const propertiesToSchema = async (modelProperties: Property[]): Promise<T> =>
			JSONSchemaBuilder.object((
				await Promise.all(modelProperties.map(
					async m => ({property: m.shortName, schema: (await mapPropertyToJSONSchema(m))})
				))
			).reduce((properties, {property, schema}) => ({...properties, [property]: schema}), {})) as T;

		return mapPropertyToJSONSchema(property);
	}

	getClasses = this.memoize(async (): Promise<Class[]> => (await this.apiClient.fetchJSON("/metadata/classes")).results)
}
