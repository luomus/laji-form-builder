export enum PropertyRange {
	Int = "xsd:integer",
	Boolean = "xsd:boolean",
	String = "xsd:string",
	Id = "@id",
	PositiveInteger = "xsd:positiveInteger",
	DateTime = "xsd:dateTime",
	NonNegativeInteger = "xsd:nonNegativeInteger",
	keyValue = "MZ.keyValue",
	keyAny = "MZ.keyAny"
}

export interface PropertyModel {
	property: string;
	label: string;
	range: (PropertyRange | string)[];
	shortName: string;
	comment?: string;
	maxOccurs: string;
	multiLanguage: boolean;
	isEmbeddable?: boolean;
}

export interface PropertyContext {
	"@id": string;
	"@type"?: PropertyRange;
	"@container"?: "@set";
}
