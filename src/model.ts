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
	keyAny = "MZ.keyAny",
	Decimal = "xsd:decimal"
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
	domain: string[];
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
	"@type"?: string;
	"@context"?: string;
}

export interface FieldOptions {
	excludeFromCopy?: boolean;
	default?: any;
	whitelist?: string[];
	blacklist?: string[];
	uniqueItems?: string;
	value_options?: Record<string, string>
		target_element?: {
			type: "text";
		};
}

export interface Field {
	name: string;
	type?: "checkbox" | "collection" | "fieldset";
	required?: boolean;
	options?: FieldOptions;
	validators?: any;
	warnings?: any;
	label?: string;
	formID?: string;
	fields?: Field[];
}

export interface AltTreeParent {
	children: Record<string, AltTreeNode>;
	order: string[];
}
export type AltTreeLeaf = {
	[K in any]: never;
}
export type AltTreeNode = AltTreeParent | AltTreeLeaf;

export type AltParentMap = Record<string, string[]>;

export interface SchemaFormat {
	options?: any;
	schema?: any;
	uiSchema?: any;
	validators?: any;
	warnings?: any;
	excludeFromCopy: string[];
	extra?: Record<string, {altParent: AltParentMap}>;
	uiSchemaContext?: Record<string, {tree: AltTreeParent}>;
}

export interface JSONSchemaE extends JSONSchema7 {
	excludeFromCopy?: boolean;
	enumNames?: string[];
}

export interface Range {
	id: string;
	value?: Partial<Record<Lang, string>>;
	altParent?: string;
}

export interface Class {
	class: string;
	label: Partial<Record<Lang, string>>;
	shortName: string
}
