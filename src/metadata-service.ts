import memoize from "memoizee";
import ApiClient from "laji-form/lib/ApiClient";
import { PropertyModel, PropertyContext } from "./model";
import { fetchJSON } from "./utils";

type PropertyContextDict = Record<string, PropertyContext>;

export default class MetadataService {
	apiClient: ApiClient;

	constructor(apiClient: ApiClient) {
		this.apiClient = apiClient;
	}

	getPropertyNameFromContext(propertyContext: PropertyContext) {
		let id = propertyContext["@id"];
		id = id.replace("http://tun.fi/", "");
		switch (id) {
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
		return id;
	}

	propertiesContext = new Promise<PropertyContextDict>(
		(resolve, reject) => fetchJSON("https://schema.laji.fi/context/document.jsonld").then(result => {
			result?.["@context"] ? resolve(preparePropertiesContext(result?.["@context"])) : reject();
		}, reject))

	getProperties = memoize((property: PropertyContext | string): Promise<PropertyModel[]> => 
		new Promise((resolve, reject) => this.apiClient.fetch(`/metadata/classes/${typeof property === "string" ? property : this.getPropertyNameFromContext(property)}/properties`).then(
			(r: any) => 
				r?.results
					? resolve(r.results as PropertyModel[])
					: reject(),
			reject))
	)

	getRange = memoize((property: PropertyContext | string): Promise<string[]> => this.apiClient.fetch(`/metadata/ranges/${typeof property === "string" ? property : this.getPropertyNameFromContext(property)}`).then((result: {id: string}[]) => result.map(({id}) => id)))
}

const preparePropertiesContext = (propertiesContext: PropertyContextDict) => ({
	document: {
		"@id": "http://tun.fi/MY.document",
		"@container": "@set" as const,
	},
	...propertiesContext
})
