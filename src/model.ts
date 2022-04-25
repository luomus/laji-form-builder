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

export const LANGS: Lang[] = ["fi", "en", "sv"];

export const isLang = (lang: any): lang is Lang => typeof lang === "string" && LANGS.includes(lang as any);

export type CompleteTranslations = Record<Lang, {[key: string]: string}>;
export type Translations = Partial<Record<Lang, {[key: string]: string}>>;

export interface CommonFormat {
	id?: string;
	options?: any;
	title?: string;
	logo?: string;
	description?: string;
	shortDescription?: string;
	supportedLanguage?: Lang[];
	category?: string;
	collectionID?: string;
	name?: string;
	translations?: Translations;
	language?: Lang;
}

export interface FormListing extends CommonFormat {
	id: string;
}

export interface CommonExpanded extends CommonFormat {
	uiSchema?: any;
}

export interface Master extends CommonExpanded {
	fields?: (Field | FormExtensionField)[];
	baseFormID?: string;
	patch?: any[];
	"@type"?: string;
	"@context"?: string;
	context?: string;
	extra?: Record<string, {altParent: AltParentMap}>;
}

export interface SchemaFormat extends CommonExpanded {
	schema?: any;
	validators?: any;
	warnings?: any;
	excludeFromCopy: string[];
	extra?: Record<string, {altParent: AltParentMap}>;
	uiSchemaContext?: Record<string, {tree: AltTreeParent}>;
	language?: Lang;
	context?: string;
	translations?: Translations;
}

export interface ExpandedJSONFormat extends CommonExpanded {
	fields?: ExpandedField[];
}

export interface ExpandedMaster extends Omit<Master, "baseFormID"> {
	fields?: Field[];
}

export function isFormExtensionField(field: Field | FormExtensionField): field is FormExtensionField {
	return !!(field as any).formID;
}

export interface FieldOptions {
	excludeFromCopy?: boolean;
	default?: any;
	whitelist?: string[];
	blacklist?: string[];
	uniqueItems?: boolean;
	maxItems?: number;
	minItems?: number;
	value_options?: Record<string, string>;
}

export interface Field {
	name: string;
	type?: "hidden";
	required?: boolean;
	options?: FieldOptions;
	validators?: any;
	warnings?: any;
	label?: string;
	fields?: Field[];
}

export type ExpandedFieldType =
	"text"
	| "fieldset"
	| "select"
	| "checkbox"
	| "string"
	| "number"
	| "integer"
	| "integer:nonNegativeInteger"
	| "integer:positiveInteger";

export interface ExpandedFieldOptions extends FieldOptions {
	target_element?: {
		type: ExpandedFieldType;
	};
}

export interface ExpandedField extends Omit<Field, "type" | "fields"> {
	type?: "hidden" | "collection" | ExpandedFieldType;
	fields?: ExpandedField[];
	options?: ExpandedFieldOptions;
}

export interface FormExtensionField {
	formID: string;
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

export interface JSONSchemaE extends JSONSchema7 {
	excludeFromCopy?: boolean;
	enumNames?: string[];
}

export interface Range {
	id: string;
	value?: Partial<Record<Lang, string>>;
	vernacularName?: Partial<Record<Lang, string>>;
	altParent?: string;
}

export interface Class {
	class: string;
	label: Partial<Record<Lang, string>>;
	shortName: string
}

export interface FormDeleteResult {
	affected: number;
}

export enum Format {
	Schema = "schema",
	JSON = "json"
}
