import * as React from "react";
import parsePropTypes from "parse-prop-types";
import memoize from "memoizee";
import * as LajiFormUtils from "laji-form/lib/utils";
const { isObject } = LajiFormUtils;

export const classNames = (...cs: any[]) => cs.filter(s => typeof s === "string").join(" ");

const CSS_NAMESPACE = "ljb";

export const nmspc = (_nmspc?: string) => (s?: any) => s === undefined
	? `${CSS_NAMESPACE}${_nmspc ? `-${_nmspc}` : ""}`
	: s
		? `${CSS_NAMESPACE}${_nmspc ? `-${_nmspc}` : ""}-${s}`
		: "";

export const gnmspc  = nmspc();

export const getComponentPropTypes = (field: React.Component) => field && parsePropTypes(field);

export const propTypesToSchema = (propTypes: any): any => {
	const name = propTypes.name || (propTypes.type || {}).name;
	const value = propTypes.value || (propTypes.type || {}).value;
	switch (name) {
		case "shape":
			return {type: "object", properties: Object.keys(value).reduce((properties, prop) => ({
				...properties,
				[prop]: propTypesToSchema(value[prop])
			}), {})};
		case "arrayOf":
			return {type: "array", items: propTypesToSchema(value)};
		case "oneOf":
			return {type: "string", enum: value, enumNames: value};
		case "string":
			return {type: "string"};
		case "number":
			return {type: "number"};
		case "bool":
			return {type: "boolean"};
		case "object":
		case "custom":
			return {type: "object", properties: {}};
		default:
			console.warn(`Unhandled PropType type ${name}`);
			return {type: "object", properties: {}};
	}
};

export const getTranslatedUiSchema = memoize((uiSchema: any, translations: any): any => {
	function translate(obj: any): any {
		if (isObject(obj)) {
			return Object.keys(obj).reduce((translated, key) => ({
				...translated,
				[key]: translate(obj[key])
			}), {});
		} else if (Array.isArray(obj)) {
			return obj.map(translate);
		}
		if (typeof obj === "string" && obj[0] === "@") {
			return translations[obj];
		}
		return obj;
	}
	return translate(uiSchema);
});

export const fieldPointerToSchemaPointer = (schema: any, pointer: string): string => {
	let schemaPointer = schema;
	return pointer.split("/").filter(s => s).reduce((resultPointer: string, s): string => {
		if (schemaPointer.items && schemaPointer.items.properties) {
			schemaPointer = schemaPointer.items.properties[s];
			return `${resultPointer}/items/properties/${s}`;
		}
		if (schemaPointer.properties) {
			schemaPointer = schemaPointer.properties[s];
			return `${resultPointer}/properties/${s}`;
		}
		throw new Error(`failed to parse field schema pointer ${pointer}`);
	}, "");
}
export const fieldPointerToUiSchemaPointer = (schema: any, pointer: string): string => {
	let schemaPointer = schema;
	return pointer.split("/").filter(s => s).reduce((resultPointer: string, s): string => {
		if (schemaPointer.items && schemaPointer.items.properties) {
			schemaPointer = schemaPointer.items.properties[s];
			return `${resultPointer}/items/${s}`;
		}
		if (schemaPointer.properties) {
			schemaPointer = schemaPointer.properties[s];
			return `${resultPointer}/${s}`;
		}
		throw new Error(`failed to parse field uischema pointer ${pointer}`);
	}, "");
};

