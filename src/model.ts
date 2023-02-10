import { isObject } from "./utils";

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

export type Property = {
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

export const isLang = (lang: unknown): lang is Lang => typeof lang === "string" && LANGS.includes(lang as any);

export type CompleteTranslations = Record<Lang, Record<string, string>>;
export type Translations = Partial<CompleteTranslations>

type KnownFormOptions = {
	prepopulatedDocument?: Record<string, JSONObject>;
	prepopulateWithInformalTaxonGroups?: string[];
	useSchemaCommentsAsHelpTexts?: boolean;
}
export type FormOptions = JSONObject & KnownFormOptions;

export type CommonFormat = {
	id?: string;
	options?: FormOptions;
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
	uiSchema?: JSONObject;
}

export type JSON = string | number | boolean | JSONObject | JSON[] | null;
export type JSONObject = { [prop: string]: JSON };

export const isJSONObject = (json: JSON): json is JSONObject => isObject(json);

export const isJSONObjectOrUndefined = (v?: JSON): v is (undefined | JSON) => v === undefined || isJSONObject(v);

export type Master = CommonExpanded & {
	fields?: Field[];
	baseFormID?: string;
	fieldsFormID?: string;
	patch?: any[];
	"@type"?: string;
	"@context"?: string;
	context?: string;
	extra?: Record<string, {altParent: AltParentMap}>;
}

export function isMaster(master: unknown): master is Master {
	return isObject(master);
}

export type SchemaFormat<T extends JSONSchemaEnumOneOf | JSONSchemaV6Enum = JSONSchemaEnumOneOf> = CommonExpanded & {
	schema: JSONSchema<T>;
	validators: {[prop: string]: (JSONObject | boolean)};
	warnings: {[prop: string]: (JSONObject | boolean)};
	excludeFromCopy: string[];
	uiSchema: JSONObject;
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
	uiSchema: JSONObject;
}

export type RemoteMaster = Master & {id: string};

export type FieldOptions = {
	excludeFromCopy?: boolean;
	default?: JSON;
	whitelist?: string[];
	blacklist?: string[];
	uniqueItems?: boolean;
	maxItems?: number;
	minItems?: number;
	value_options?: Record<string, string>;
}

export type Field = {
	name: string;
	type?: "hidden" | "string" | "checkbox";
	required?: boolean;
	options?: FieldOptions;
	validators?: Record<string, JSONObject | boolean>;
	warnings?: Record<string, JSONObject | boolean>;
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

export type AltTreeParent = {
	children: Record<string, AltTreeNode>;
	order: string[];
}
export type AltTreeLeaf = {
	[K in any]: never;
}
export type AltTreeNode = AltTreeParent | AltTreeLeaf;

export type AltParentMap = Record<string, string[]>;

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
	SchemaWithEnums = "schema-with-enums",
	JSON = "json"
}

export type JSONSchema<E extends (JSONSchemaEnumOneOf | JSONSchemaV6Enum) = JSONSchemaEnumOneOf> =
	JSONSchemaObject
	| JSONSchemaArray
	| JSONSchemaNumber
	| JSONSchemaInteger
	| JSONSchemaBoolean
	| JSONSchemaString
	| E;

type JSONShemaTypeCommon<T, D> = {
	type: T;
	default?: D;
	title?: string;
}

export type JSONSchemaObject<E extends (JSONSchemaEnumOneOf | JSONSchemaV6Enum) = JSONSchemaEnumOneOf>
	= JSONShemaTypeCommon<"object", Record<string, unknown>> & {
	properties: Record<string, JSONSchema<E>>;
	required?: string[];
}

export function isJSONSchemaObject<E extends (JSONSchemaEnumOneOf | JSONSchemaV6Enum) = JSONSchemaEnumOneOf>
(schema: JSONSchema<E>): schema is JSONSchemaObject {
	return schema.type === "object";
}

export type JSONSchemaArray = JSONShemaTypeCommon<"array", unknown[]> & {
	items: JSONSchema;
	uniqueItems?: boolean;
}

export type JSONSchemaNumber = JSONShemaTypeCommon<"number", number>;

export type JSONSchemaInteger = JSONShemaTypeCommon<"integer", number>;

export type JSONSchemaBoolean = JSONShemaTypeCommon<"boolean", boolean>;

export type JSONSchemaString = JSONShemaTypeCommon<"string", string>;

export type JSONSchemaEnumOneOf = JSONSchemaString & {
	oneOf: {const: string, title: string}[];
}

export function isJSONSchemaEnumOneOf(jsonSchema: JSONSchema): jsonSchema is JSONSchemaEnumOneOf {
	return !!(jsonSchema as any).oneOf;
}

export type JSONSchemaV6Enum = JSONSchemaString & {
	enum: string[];
	enumNames: string[];
}
