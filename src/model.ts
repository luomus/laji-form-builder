import {JSONSchema7} from "json-schema";
import { Translations as _Translations } from "laji-form/lib/components/LajiForm";

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

export interface Master {
	id: string;
	language: Lang;
	name?: string;
	options?: any;
	shortDescription?: string;
	title?: string;
	translations?: Translations;
	fields?: Field[];
	baseFormID?: string;
	patch: any[];
	uiSchema?: any;
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
	};
	validators?: any;
	warnings?: any;
	label?: string;
	fields?: Field[];
}

export interface Schemas {
	options?: any;
	schema?: any;
	uiSchema?: any;
	validators?: any;
	warnings?: any;
}

export interface JSONSchemaE extends JSONSchema7 {
	excludeFromCopy?: boolean;
	enumNames?: string[];
}
