import memoize from "memoizee";
import ApiClient from "laji-form/lib/ApiClient";
import { PropertyModel, PropertyContext, PropertyRange, JSONSchemaE, Range, Lang } from "../model";
import { applyTransformations, fetchJSON, JSONSchema, multiLang } from "../utils";

type PropertyContextDict = Record<string, PropertyContext>;

export default class MetadataService {
	private apiClient: ApiClient;
	private lang: Lang;

	private allRanges: Record<string, Range[]>;

	constructor(apiClient: ApiClient, lang: Lang) {
		this.apiClient = apiClient;
		this.lang = lang;
	}

	setLang(lang: Lang) {
		this.lang = lang;
	}

	getPropertyNameFromContext(property: PropertyContext | string) {
		let propertyName = typeof property === "string"
			? property
			: property["@id"].replace("http://tun.fi/", "");
		if (!propertyName.match(/[^.]+\./)) {
			propertyName = `MY.${propertyName}`;
		}
		switch (propertyName) {
		case  "MY.gatherings":
			return "MY.gathering";
		case  "MY.gatheringEvent":
			return "MZ.gatheringEvent";
		case  "MY.gatheringFact":
			return "MY.gatheringFactClass";
		case  "MY.taxonCensus":
			return "MY.taxonCensusClass";
		case  "MY.units":
			return "MY.unit";
		case  "MY.unitFact":
			return "MY.unitFactClass";
		case  "MY.unitGathering":
			return "MZ.unitGathering";
		case  "MY.identifications":
			return "MY.identification";
		}
		return propertyName;
	}

	propertiesContext = new Promise<PropertyContextDict>(
		(resolve, reject) => fetchJSON("https://schema.laji.fi/context/document.jsonld").then(result => {
			result?.["@context"] ? resolve(preparePropertiesContext(result?.["@context"])) : reject();
		}, reject))

	getProperties = memoize(async (property: PropertyContext | string): Promise<PropertyModel[]> => 
		(await this.apiClient.fetch(`/metadata/classes/${this.getPropertyNameFromContext(property)}/properties`, {lang: "multi"})).results as PropertyModel[]
	)

	getRange = memoize((property: PropertyContext | string): Promise<Range[]> => 
		this.allRanges && Promise.resolve(this.allRanges[this.getPropertyNameFromContext(property)])
		|| this.apiClient.fetch(`/metadata/ranges/${typeof property === "string" ? property : this.getPropertyNameFromContext(property)}`, {lang: "multi"}))

	getAllRanges = async () => {
		if (this.allRanges) {
			return this.allRanges;
		}
		const ranges = await (this.apiClient.fetch("/metadata/ranges", {lang: "multi"}) as Promise<Record<string, Range[]>>);
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
					enumNames.push(e.value
						? (e.value[this.lang] ?? e.value["en"] ?? e.id)
						: e.id
					);
				}
				return ({type: "string", enum: enums, enumNames});
			}
			if (property.multiLanguage) {
				return JSONSchema.object(["fi", "sv", "en"].reduce((props, lang) => ({...props, [lang]: {type: "string"}}), {}));
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
			case PropertyRange.keyValue:
			case PropertyRange.keyAny:
				schema = JSONSchema.object();
				break;
			default:
				if (property.property === "MHL.prepopulatedDocument") {
					schema = JSONSchema.object();
				} else if (!property.isEmbeddable && property.property !== "MY.geometry") {
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

		const mapLabel = (schema: JSONSchemaE, {label}: PropertyModel) => ({...schema, title: multiLang(label, this.lang)});

		const mapPropertyToJSONSchema = (property: PropertyModel): Promise<JSONSchemaE> =>
			applyTransformations<JSONSchema, PropertyModel>(mapRangeToSchema(property), property, [
				mapMaxOccurs,
				mapUniqueItemsForUnboundedAlt,
				mapLabel
			]);

		const propertiesToSchema = async (modelProperties: PropertyModel[]): Promise<JSONSchemaE> =>
			JSONSchema.object(
				(await Promise.all(modelProperties.map(async m => ({property: m.shortName, schema: (await mapPropertyToJSONSchema(m))}))))
					.reduce((properties, {property, schema}) => ({...properties, [property]: schema}), {})
			);

		return mapPropertyToJSONSchema(property);
	}
}

const preparePropertiesContext = (propertiesContext: PropertyContextDict) => ({
	document: {
		"@id": "http://tun.fi/MY.document",
		"@container": "@set" as const,
	},
	...propertiesContext
});
