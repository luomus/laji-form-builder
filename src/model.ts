import { JSONSchema7 } from "json-schema";

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
	label: Partial<Record<Lang, string>>;
	range: (PropertyRange | string)[];
	shortName: string;
	comment?: Partial<Record<Lang, string>>;
	maxOccurs: string;
	minOccurs: string;
	multiLanguage: boolean;
	isEmbeddable: boolean;
	required: boolean
}

export interface PropertyContext {
	"@id": string;
	"@type"?: PropertyRange;
	"@container"?: "@set";
}

export type Lang = "fi" | "sv" | "en";
export type Translations = Record<Lang, {[key: string]: string}>;


export interface FormListing {
	id: string;
	options?: any;
	title?: string;
}

export interface Master extends FormListing {
	language?: Lang;
	name?: string;
	shortDescription?: string;
	translations?: Translations;
	fields?: Field[];
	baseFormID?: string;
	patch?: any[];
	uiSchema?: any;
	collectionID?: string;
}

export interface Field {
	name: string;
	type?: "checkbox" | "collection" | "fieldset";
	required?: boolean;
	options?: {
		excludeFromCopy?: boolean;
		default?: any;
		required?: boolean;
		whitelist?: string[];
		value_options?: Record<string, string>
	};
	validators?: any;
	warnings?: any;
	label?: string;
	formID?: string;
	fields?: Field[];
}

export interface SchemaFormat {
	options?: any;
	schema?: any;
	uiSchema?: any;
	validators?: any;
	warnings?: any;
	excludeFromCopy: string[];
	extra?: any;
}

export interface JSONSchemaE extends JSONSchema7 {
	excludeFromCopy?: boolean;
	enumNames?: string[];
}

export interface Range {
	id: string;
	value?: Partial<Record<Lang, string>>;
}
