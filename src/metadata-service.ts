import memoize from "memoizee";
import ApiClient from "laji-form/lib/ApiClient";
import { PropertyModel, PropertyContext, PropertyRange } from "./model";
import { fetchJSON, JSONSchema } from "./utils";
import { JSONSchema7 } from "json-schema";

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
		const mapRangeToSchema = (property: Pick<PropertyModel, "property" | "range" | "isEmbeddable" | "multiLanguage">): Promise<JSONSchema7> => {
			const range = property.range[0];
			if (this.isAltRange(range)) {
				return this.getRange(range).then(_enums => {
					let enums = [""], enumNames = [""];
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
			case "MY.document":
				schema = JSONSchema.object();
				break;
			default:
				if (!property.isEmbeddable && property.property !== "MY.geometry") {
					schema = JSONSchema.String();
				} else {
					return this.getProperties(range).then(_model => propertiesToSchema(_model));
				}
			}
			return Promise.resolve(schema);
		};

		const mapMaxOccurs = (maxOccurs: string) => (schema: JSONSchema7) =>
			maxOccurs === "unbounded"
				? JSONSchema.array(schema)
				: schema;

		const mapUniqueItemsForUnboundedAlt = (range: (PropertyRange | string)[], maxOccurs: string) => (schema: JSONSchema7) => 
			maxOccurs === "unbounded" && this.isAltRange(range[0])
				? {...schema, uniqueItems: true}
				: schema;

		const mapLabel = (label: string | undefined) => (schema: JSONSchema7) => ({...schema, title: label});

		const mapPropertyToJSONSchema = ({property, label, range, maxOccurs, multiLanguage, isEmbeddable}: Pick<PropertyModel, "property" | "label" | "range" | "maxOccurs" | "multiLanguage" | "isEmbeddable">): Promise<JSONSchema7> =>
			(mapRangeToSchema({property, range, isEmbeddable, multiLanguage})).then(schema => 
				applyTransformations<JSONSchema7>(schema, [
					mapMaxOccurs(maxOccurs),
					mapUniqueItemsForUnboundedAlt(range, maxOccurs),
					mapLabel(label)
				])
			);

		const propertiesToSchema = (modelProperties: PropertyModel[]): Promise<JSONSchema7> => Promise.all(modelProperties.map(m => mapPropertyToJSONSchema(m).then(schema => ({property: m.shortName, schema}))))
			.then(propertiesAndSchemas => (
				JSONSchema.object(propertiesAndSchemas.reduce((properties, {property, schema}) => ({...properties, [property]: schema}), {}))
			));

		return mapPropertyToJSONSchema(property);
	}
}

function applyTransformations<T>(schema: T, fns: ((schema: T) => T)[]) {
	return fns.reduce((schema, fn) => fn(schema), schema);
}

const preparePropertiesContext = (propertiesContext: PropertyContextDict) => ({
	document: {
		"@id": "http://tun.fi/MY.document",
		"@container": "@set" as const,
	},
	...propertiesContext
});
