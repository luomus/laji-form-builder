import memoize, { Memoized } from "memoizee";
import ApiClient from "../api-client";
import { PropertyModel, PropertyContext, PropertyRange, JSONSchemaE, Range, Lang, Class } from "../model";
import { reduceWith, fetchJSON, JSONSchema, multiLang, unprefixProp } from "../utils";

export default class MetadataService {
	private apiClient: ApiClient;
	private lang: Lang;
	private allRanges: Record<string, Range[]>;
	private cacheStore: (Memoized<any>)[] = [];

	constructor(apiClient: ApiClient, lang: Lang) {
		this.apiClient = apiClient;
		this.lang = lang;
	}

	// eslint-disable-next-line @typescript-eslint/ban-types
	private cache<F extends Function>(fn: F) {
		const cached = memoize(fn, { promise: true, primitive: true });
		this.cacheStore.push(cached);
		return cached;
	}

	flush() {
		this.cacheStore.forEach(c => c.clear());
		this.cacheStore = [];
	}

	setLang(lang: Lang) {
		this.lang = lang;
	}

	getPropertyNameFromContext(property: PropertyContext | string) {
		let propertyName = typeof property === "string"
			? property
			: property["@id"].replace("http://tun.fi/", "");
		return propertyName;
	}

	getPropertiesContextFor = this.cache((context: string) => 
		fetchJSON<{"@context": Record<string, PropertyContext>}>(`https://schema.laji.fi/context/${context}.jsonld`)
			.then(result => result["@context"]))

	getProperties = this.cache(async (property: PropertyContext | string, lang = "multi"): Promise<PropertyModel[]> => {
		return (await this.apiClient.fetchJSON(
			`/metadata/classes/${unprefixProp(this.getPropertyNameFromContext(property))}/properties`,
			{lang})
		).results as PropertyModel[];
	})

	getRange = this.cache((property: PropertyContext | string): Promise<Range[]> => 
		this.allRanges && Promise.resolve(this.allRanges[this.getPropertyNameFromContext(property)])
		|| this.apiClient.fetchJSON(
			// eslint-disable-next-line max-len
			`/metadata/ranges/${unprefixProp(typeof property === "string" ? property : this.getPropertyNameFromContext(property))}`,
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

	getJSONSchemaFromProperty(property: PropertyModel) {
		const mapRangeToSchema = async (property: PropertyModel): Promise<JSONSchemaE> => {
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
				return JSONSchema.enu({enum: enums, enumNames});
			}
			if (property.multiLanguage) {
				return JSONSchema.object(["fi", "sv", "en"].reduce((props, lang) =>
					({...props, [lang]: {type: "string"}}),
				{}));
			}
			let schema;
			switch (range) {
			case PropertyRange.String:
				schema = JSONSchema.String();
				break;
			case PropertyRange.Boolean:
				schema = JSONSchema.Boolean();
				break;
			case PropertyRange.Int:
				schema = JSONSchema.Integer();
				break;
			case PropertyRange.NonNegativeInteger:
				schema = JSONSchema.Integer({minimum: 0});
				break;
			case PropertyRange.PositiveInteger:
				schema = JSONSchema.Integer({exclusiveMinimum: 0});
				break;
			case PropertyRange.Decimal:
				schema = JSONSchema.Number();
				break;
			case PropertyRange.DateTime:
				schema = JSONSchema.String({format: "date-time"});
				break;
			case PropertyRange.keyValue:
			case PropertyRange.keyAny:
				schema = JSONSchema.object();
				break;
			default:
				if (!property.isEmbeddable && unprefixProp(property.property) !== "geometry") {
					schema = JSONSchema.String();
				} else {
					return propertiesToSchema(await this.getProperties(range));
				}
			}
			return schema;
		};

		const mapMaxOccurs = (schema: JSONSchemaE, {maxOccurs}: PropertyModel) =>
			maxOccurs === "unbounded"
				? JSONSchema.array(schema)
				: schema;

		const mapUniqueItemsForUnboundedAlt = async (schema: JSONSchemaE, {range, maxOccurs}: PropertyModel) => 
			(await this.isAltRange(range[0])) && maxOccurs === "unbounded"
				? {...schema, uniqueItems: true}
				: schema;


		const mapLabel = (schema: JSONSchemaE, {label}: PropertyModel) =>
			({...schema, title: multiLang(label, this.lang)});

		const mapPropertyToJSONSchema = (property: PropertyModel): Promise<JSONSchemaE> =>
			reduceWith(
				mapRangeToSchema(property),
				property, 
				mapMaxOccurs,
				mapUniqueItemsForUnboundedAlt,
				mapLabel
			);

		const propertiesToSchema = async (modelProperties: PropertyModel[]): Promise<JSONSchemaE> =>
			JSONSchema.object((
				await Promise.all(modelProperties.map(
					async m => ({property: m.shortName, schema: (await mapPropertyToJSONSchema(m))})
				))
			).reduce((properties, {property, schema}) => ({...properties, [property]: schema}), {}));

		return mapPropertyToJSONSchema(property);
	}

	getClasses = this.cache(async (): Promise<Class[]> => (await this.apiClient.fetchJSON("/metadata/classes")).results)
}
