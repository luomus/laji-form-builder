export enum PropertyRange {
	Int = "xsd:integer",
	Boolean = "xsd:boolean",
	String = "xsd:string",
	Id = "@id",
	PositiveInteger = "xsd:positiveInteger",
	DateTime = "xsd:dateTime"
}

export interface PropertyModel {
	property: string;
	label: string;
	range: PropertyRange[];
	shortName: string;
	comment?: string;
	maxOccurs: string;
	multiLanguage: boolean;
}

export interface PropertyContext {
	"@id": string;
	"@type"?: PropertyRange;
	"@container"?: "@set";
}
