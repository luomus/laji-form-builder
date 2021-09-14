import memoize from "memoizee";
import ApiClient from "laji-form/lib/ApiClient";
import { PropertyModel, PropertyContext, PropertyRange, JSONSchemaE } from "./model";
import { applyTransformations, fetchJSON, JSONSchema } from "./utils";

type PropertyContextDict = Record<string, PropertyContext>;

const specialRanges = ["MX.secureLevels", "MY.recordBases", "MY.samplingMethods"];

export default class MetadataService {
	private apiClient: ApiClient;

	constructor(apiClient: ApiClient) {
		this.apiClient = apiClient;
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

	getProperties = memoize((property: PropertyContext | string): Promise<PropertyModel[]> => 
		new Promise((resolve, reject) => this.apiClient.fetch(`/metadata/classes/${this.getPropertyNameFromContext(property)}/properties`).then(
			(r: any) => 
				r?.results
					? resolve(r.results as PropertyModel[])
					: reject(),
			reject))
	)

	getRange = memoize((property: PropertyContext | string): Promise<{id: string, value: string}[]> => this.apiClient.fetch(`/metadata/ranges/${typeof property === "string" ? property : this.getPropertyNameFromContext(property)}`));

	isAltRange = (range: string) => range.match(/Enum$/) || specialRanges.includes(range);

	getJSONSchemaFromProperty(property: PropertyModel) {
		const mapRangeToSchema = (property: PropertyModel): Promise<JSONSchemaE> => {
			const range = property.range[0];
			if (this.isAltRange(range)) {
				return this.getRange(range).then(_enums => {
					const empty = property.minOccurs === "1" ? [] : [""];
					let enums = [...empty], enumNames = [...empty];
					for (const e of _enums) {
						enums.push(e.id);
						enumNames.push(e.value);
					}
					return ({type: "string", enum: enums, enumNames})
				});
			}
			if (property.multiLanguage) {
				return Promise.resolve(JSONSchema.object(["fi", "sv", "en"].reduce((props, lang) => ({...props, [lang]: {type: "string"}}), {})));
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
			case PropertyRange.NonNegativeInteger:
				schema = JSONSchema.Integer();
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
					return this.getProperties(range).then(_model => propertiesToSchema(_model));
				}
			}
			return Promise.resolve(schema);
		};

		const mapMaxOccurs = (schema: JSONSchemaE, {maxOccurs}: PropertyModel) =>
			maxOccurs === "unbounded"
				? JSONSchema.array(schema)
				: schema;

		const mapUniqueItemsForUnboundedAlt = (schema: JSONSchemaE, {range, maxOccurs}: PropertyModel) =>
			maxOccurs === "unbounded" && this.isAltRange(range[0])
				? {...schema, uniqueItems: true}
				: schema;

		const mapLabel = (schema: JSONSchemaE, {label}: PropertyModel) => ({...schema, title: label});

		const mapPropertyToJSONSchema = (property: PropertyModel): Promise<JSONSchemaE> =>
			(mapRangeToSchema(property)).then(schema => 
				applyTransformations(schema, property, [
					mapMaxOccurs,
					mapUniqueItemsForUnboundedAlt,
					mapLabel
				])
			);

		const propertiesToSchema = (modelProperties: PropertyModel[]): Promise<JSONSchemaE> => Promise.all(modelProperties.map(m => mapPropertyToJSONSchema(m).then(schema => ({property: m.shortName, schema}))))
			.then(propertiesAndSchemas => (
				JSONSchema.object(propertiesAndSchemas.reduce((properties, {property, schema}) => ({...properties, [property]: schema}), {}))
			));

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
