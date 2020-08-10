import * as React from "react";
import parsePropTypes from "parse-prop-types";
import memoize from "memoizee";
import fetch from "isomorphic-fetch";
import * as LajiFormUtils from "laji-form/lib/utils";
const { isObject, parseJSONPointer } = LajiFormUtils;

export const classNames = (...cs: any[]) => cs.filter(s => typeof s === "string").join(" ");

const CSS_NAMESPACE = "ljb";

export const nmspc = (_nmspc?: string) => (s?: any) => s === undefined
	? `${CSS_NAMESPACE}${_nmspc ? `-${_nmspc}` : ""}`
	: s
		? `${CSS_NAMESPACE}${_nmspc ? `-${_nmspc}` : ""}-${s}`
		: "";

export const gnmspc  = nmspc();

export const getComponentPropTypes = (field: React.Component) => field && parsePropTypes(field);

export const propTypesToSchema = (propTypes: any, propPrefix?: string): any => {
	const name = propTypes.name || (propTypes.type || {}).name;
	const value = propTypes.value || (propTypes.type || {}).value;
	switch (name) {
	case "shape":
		return {type: "object", properties: Object.keys(value).reduce((properties, prop) => ({
			...properties,
			[typeof propPrefix === "string" ? `${propPrefix}${prop}` : prop]: propTypesToSchema(value[prop], propPrefix)
		}), {})};
	case "arrayOf":
		return {type: "array", items: propTypesToSchema(value, propPrefix)};
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
		//console.warn(`Unhandled PropType type ${name}`);
		return {type: "object", properties: {}};
	}
};

export const getTranslatedUiSchema = memoize((uiSchema: any, translations: any, prefix?: string, schemaForUiSchema?: any): any => {
	function translate(obj: any, schemaForUiSchema?: any): any {
		if (isObject(obj)) {
			return Object.keys(obj).reduce<any>((translated, key) => {
				const propSchemaForUiSchema = schemaForUiSchema?.properties?.[key];
				const _key = propSchemaForUiSchema && prefix ? `${prefix}${key}` : key;
				translated[_key] = translate(obj[key], propSchemaForUiSchema);
				return translated;
			}, {});
		} else if (Array.isArray(obj)) {
			return obj.map(item => translate(item, schemaForUiSchema?.items));
		}
		if (typeof obj === "string" && obj[0] === "@") {
			return translations[obj];
		}
		return obj;
	}
	return translate(uiSchema, schemaForUiSchema);
});

export const translate = (obj: any, translations: any) => {
	function translate(obj: any): any {
		if (isObject(obj)) {
			return Object.keys(obj).reduce<any>((translated, key) => {
				translated[key] = translate(obj[key]);
				return translated;
			}, {});
		} else if (Array.isArray(obj)) {
			return obj.map(translate);
		}
		if (typeof obj === "string" && obj[0] === "@") {
			return translations[obj];
		}
		return obj;
	}
	return translate(obj);
}

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

export const alterObjectKeys = (obj: any, replace: (key: string) => string): any => {
	if (isObject(obj)) {
		return Object.keys(obj).reduce((translated, key) => ({
			...translated,
			[replace(key)]: alterObjectKeys(obj[key], replace)
		}), {});
	} else if (Array.isArray(obj)) {
		return obj.map(i => alterObjectKeys(i, replace));
	}
	return obj;
};
export const unprefixDeeply = (obj: any, prefix: string): any => {
	return alterObjectKeys(obj, (key => key.startsWith(prefix) ? key.substr(prefix.length, key.length) : key));
}
export const prefixDeeply = (obj: any, prefix?: string): any => {
	if (prefix === undefined) {
		return obj;
	}
	return alterObjectKeys(obj, (key => `${prefix}${key}`));
}

export const alterSchemaKeys = (schema: any, replace: (key: string) => string): any => {
	if (schema.type === "object") {
		return {
			...schema,
			properties: Object.keys(schema.properties).reduce((translated, key) => ({
				...translated,
				[replace(key)]: alterSchemaKeys(schema.properties[key], replace)
			}), {})
		};
	} else if (schema.type === "array" && schema.items.type === "object") {
		return {
			...schema,
			items: {
				...schema.items,
				properties: Object.keys(schema.items.properties).reduce((translated, key) => ({
					...translated,
					[replace(key)]: alterSchemaKeys(schema.items.properties[key], replace)
				}), {})
			}
		};
	}
	return schema;
};
export const unprefixSchemaDeeply = (schema: any, prefix: string): any => {
	return alterSchemaKeys(schema, (key => key.startsWith(prefix) ? key.substr(prefix.length, key.length) : key));
};
export const prefixSchemaDeeply = (schema: any, prefix?: string): any => {
	if (prefix === undefined) {
		return schema;
	}
	return alterSchemaKeys(schema, (key => `${prefix}${key}`));
};

export const alterUiSchemaKeys = (uiSchema: any, schema: any, replace: (key: string) => string): any => {
	if (schema
		&& schema.type === "object"
		&& Object.keys(schema.properties).length // For 'custom' prop type
	) {
		return Object.keys(uiSchema).reduce((translated, key) => ({
			...translated,
			[replace(key)]: alterUiSchemaKeys(uiSchema[key], schema.properties[key], replace)
		}), {});
	} else if (schema
		&& schema.type === "array"
		&& schema.items.type === "object"
		&& Object.keys(schema.items.properties).length // For 'custom' prop type
	) {
		if (!uiSchema.items) {
			return uiSchema;
		}
		return {
			...uiSchema,
			items: {
				...uiSchema.items,
				...Object.keys(schema.items.properties).reduce((translated: any, key) => {
					if (uiSchema.items[key] && Object.keys(uiSchema.items[key]).length) {
						translated[key] = alterUiSchemaKeys(uiSchema.items[key], schema.items.properties[key], replace);
					}
					return translated;
				}, {})
			}
		};
	}
	return uiSchema;
};
export const unprefixUiSchemaDeeply = (uiSchema: any, schema: any, prefix: string): any => {
	return alterUiSchemaKeys(uiSchema, schema, (key => key.startsWith(prefix) ? key.substr(prefix.length, key.length) : key));
};
export const prefixUiSchemaDeeply = (uiSchema: any, schema: any, prefix?: string): any => {
	if (prefix === undefined) {
		return uiSchema;
	}
	return alterUiSchemaKeys(uiSchema, schema, (key => `${prefix}${key}`));
};

export const fetchJSON = (path: string, options?: any) => fetch(path, options).then(r => r.json());

export interface CancellablePromise<T> {
	promise: Promise<T>;
	cancel: () => void;
}

export const makeCancellable = <T>(promise: Promise<T>): CancellablePromise<T> => {
	let hasCancelled = false;

	const wrappedPromise = new Promise<T>((resolve, reject) => {
		promise.then(
			val => hasCancelled ? reject({isCanceled: true}) : resolve(val),
			error => hasCancelled ? reject({isCanceled: true}) : reject(error)
		);
	});

	return {
		promise: wrappedPromise,
		cancel() {
			hasCancelled = true;
		},
	};
};

export const unprefixProp = (s: string) => s.replace(/^.+\./, "");

export const unprefixer = (prefix: string = "") => (s: string) => s.startsWith(prefix) ? s.substr(prefix.length, s.length) : s;

export const getTranslation = (key: string, translations: {[key: string]: string}): string | undefined => {
	if (typeof key === "string") {
		return translations[key] || (key[0] === "@" && translations[unprefixer("@")(key)] || undefined);
	}
	return;
};

export const detectChangePaths = (eventObject: any, translatedObj: any): string[] => {
	const detectChangePaths = (_eventObject: any, _translatedObj: any, path: string): string[] => {
		if (isObject(_eventObject) || isObject(_translatedObj)) {
			if (!isObject(_translatedObj) || !isObject(_eventObject)) {
				return [path];
			}
			return Object.keys({..._eventObject, ..._translatedObj}).reduce((paths, key) => {
				if (!(key in _eventObject) || !(key in _translatedObj)) {
					const value = ((key in _eventObject) ? _eventObject : _translatedObj)[key];
					if (isObject(value) && !Object.keys(value).length) {
						return paths
					}
					return [...paths, `${path}/${key}`];
				}
				const changes = detectChangePaths(_eventObject[key], _translatedObj[key], `${path}/${key}`);
				return changes.length ? [...paths, ...changes] : paths;
			}, []);
		} else if (Array.isArray(_eventObject) || Array.isArray(_translatedObj)) {
			if (!_translatedObj || !_eventObject || _eventObject.length !== _translatedObj.length) {
				return [path];
			}
			return _eventObject.reduce((paths: string[], item: any, idx: number) => {
				const changes = detectChangePaths(item, _translatedObj[idx], `${path}/${idx}`);
				return changes.length ? [...paths, ...changes] : paths;
			}, []);
		}
		if (parseJSONPointer(eventObject, path) !== parseJSONPointer(translatedObj, path)) {
			return [path];
		}
		return [];
	};
	return detectChangePaths(eventObject, translatedObj, "");
};

export class JSONSchema {
	static type = (type: string) => (options = {}) => ({type, ...options})
	static Str = JSONSchema.type("string")
	static str = JSONSchema.Str()
	static Number = JSONSchema.type("number")
	static number = JSONSchema.Number()
	static Int = JSONSchema.type("integer")
	static int = JSONSchema.Int()
	static Bool = JSONSchema.type("boolean")
	static bool = JSONSchema.Bool()
	static arr = (items: any, options = {}) => JSONSchema.type("array")({items, ...options})
	static enu = (_enum: {enum: string[], enumNames: string[]}, options?: any) => ({
		...JSONSchema.Str(options),
		..._enum
	})
	static obj = (properties: any, options = {}) => JSONSchema.type("object")({properties, ...options})
};

console.log(JSONSchema.arr(JSONSchema.str, {uniqueItems: true}));
