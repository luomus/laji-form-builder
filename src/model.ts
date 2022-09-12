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

export type PropertyModel = {
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

export type PropertyContext = {
	"@id": string;
	"@type"?: PropertyRange;
	"@container"?: "@set";
}

export type Lang = "fi" | "sv" | "en";

export const LANGS: Lang[] = ["fi", "en", "sv"];

export const isLang = (lang: any): lang is Lang => typeof lang === "string" && LANGS.includes(lang as any);

export type CompleteTranslations = Record<Lang, Record<string, string>>;
export type Translations = Partial<CompleteTranslations>

export type CommonFormat = {
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

export type FormListing = CommonFormat & {
	id: string;
}

export type CommonExpanded = CommonFormat & {
	uiSchema?: any;
}

export type Master = CommonExpanded & {
	fields?: (Field | FormExtensionField)[];
	baseFormID?: string;
	patch?: any[];
	"@type"?: string;
	"@context"?: string;
	context?: string;
	extra?: Record<string, {altParent: AltParentMap}>;
}

export type SchemaFormat = CommonExpanded & {
	schema?: any;
	validators: any;
	warnings: any;
	excludeFromCopy: string[];
	uiSchema: any;
	attributes?: {
		id: string
	},
	extra?: Record<string, {altParent: AltParentMap}>;
	uiSchemaContext?: Record<string, {tree: AltTreeParent}>;
	language?: Lang;
	context?: string;
	translations?: Translations;
}

export type ExpandedJSONFormat = CommonExpanded & {
	fields?: ExpandedField[];
}

export type SupportedFormat = ExpandedJSONFormat | SchemaFormat | RemoteMaster;

export type ExpandedMaster = Omit<Master, "baseFormID" | "patch"> & {
	fields?: Field[];
}

export type RemoteMaster = Master & {id: string};

export function isFormExtensionField(field: Field | FormExtensionField): field is FormExtensionField {
	return !!(field as any).formID;
}

export type FieldOptions = {
	excludeFromCopy?: boolean;
	default?: any;
	whitelist?: string[];
	blacklist?: string[];
	uniqueItems?: boolean;
	maxItems?: number;
	minItems?: number;
	value_options?: Record<string, string>;
}

export type Field = {
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

export type ExpandedFieldOptions = FieldOptions & {
	target_element?: {
		type: ExpandedFieldType;
	};
}

export type ExpandedField = Omit<Field, "type" | "fields"> & {
	type?: "hidden" | "collection" | ExpandedFieldType;
	fields?: ExpandedField[];
	options?: ExpandedFieldOptions;
}

export type FormExtensionField = {
	formID: string;
}

export type AltTreeParent = {
	children: Record<string, AltTreeNode>;
	order: string[];
}
export type AltTreeLeaf = {
	[K in any]: never;
}
export type AltTreeNode = AltTreeParent | AltTreeLeaf;

export type AltParentMap = Record<string, string[]>;

export type JSONSchemaE = JSONSchema7 & {
	enumNames?: string[];
}

export type Range = {
	id: string;
	value?: Partial<Record<Lang, string>>;
	vernacularName?: Partial<Record<Lang, string>>;
	altParent?: string;
}

export type Class = {
	class: string;
	label: Partial<Record<Lang, string>>;
	shortName: string
}

export type FormDeleteResult = {
	affected: number;
}

export enum Format {
	Schema = "schema",
	JSON = "json"
}
