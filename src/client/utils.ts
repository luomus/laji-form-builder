import * as React from "react";
import parsePropTypes from "@luomus/parse-prop-types";
import memoize from "memoizee";
import { isObject, parseJSONPointer } from "../utils";
import { ContextProps } from "./components/Context";
import { immutableDelete, isEmptyString, updateSafelyWithJSONPointer } from "@luomus/laji-form/lib/utils";
import { JSONObject, JSON, isJSONObject } from "../model";

export const classNames = (...cs: any[]) => cs.filter(s => typeof s === "string").join(" ");

export const CSS_NAMESPACE = "ljb";

/** 
 * Create a CSS Namespace factory relative to the laji-form-builder scope ("ljb").
 *
 * Example:
 * const local = nmspc("local");
 * local(""); // returns "ljb-local"
 * local("foo"); // returns "ljb-local-foo"
 **/
export const nmspc = (_nmspc?: string) => (s?: string) =>
	s === undefined
		? `${CSS_NAMESPACE}${_nmspc ? `-${_nmspc}` : ""}`
		: s
			? `${CSS_NAMESPACE}${_nmspc ? `-${_nmspc}` : ""}-${s}`
			: CSS_NAMESPACE;

/** 
 * CSS namespace relative to global laji-form-builder scope ("ljb").
 *
 * Example:
 * gnmspc(""); // returns "ljb"
 * gnmspc("foo"); // returns "ljb-foo"
 **/
export const gnmspc  = nmspc();

export const getComponentPropTypes = <T = React.Component>(field: T) => field && parsePropTypes(field);

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
		// console.warn(`Unhandled PropType type ${name}`);
		return {type: "object", properties: {}};
	}
};

export const getTranslatedUiSchema = memoize(<T extends JSONObject | undefined>
	(uiSchema: T, translations: {[key: string]: string}, prefix?: string, schemaForUiSchema?: any)
	: T => {
	function translate<T extends JSON | undefined>(obj: T, schemaForUiSchema?: any): any {
		if (isJSONObject(obj)) {
			return Object.keys(obj).reduce((translated, key) => {
				const propSchemaForUiSchema = schemaForUiSchema?.properties?.[key];
				const _key = propSchemaForUiSchema && prefix ? `${prefix}${key}` : key;
				(translated as any)[_key] = translate((obj as any)[key], propSchemaForUiSchema);
				return translated;
			}, {} as T);
		} else if (Array.isArray(obj)) {
			return obj.map(item => translate(item, schemaForUiSchema?.items));
		}
		if (typeof obj === "string" && obj[0] === "@") {
			return translations[obj] ?? translations[obj.substr(1)];
		}
		return obj;
	}
	return translate(uiSchema, schemaForUiSchema);
});


export const fieldPointerToSchemaPointer = (schema: any, pointer: string): string => {
	if (pointer === "") {
		return pointer;
	}

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
};

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
};

export const prefixDeeply = (obj: any, prefix?: string): any => {
	if (prefix === undefined) {
		return obj;
	}
	return alterObjectKeys(obj, (key => `${prefix}${key}`));
};

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
	return alterUiSchemaKeys(
		uiSchema,
		schema,
		(key => key.startsWith(prefix) ? key.substr(prefix.length, key.length) : key)
	);
};

export const prefixUiSchemaDeeply = (uiSchema: any, schema: any, prefix?: string): any => {
	if (prefix === undefined) {
		return uiSchema;
	}
	return alterUiSchemaKeys(uiSchema, schema, (key => `${prefix}${key}`));
};

export const unprefixer = (prefix = "") => (s: string) => s.startsWith(prefix) ? s.substr(prefix.length, s.length) : s;

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
						return paths;
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
	if (!eventObject && translatedObj || eventObject && !translatedObj) {
		return ["/"];
	}
	return detectChangePaths(eventObject, translatedObj, "");
};

export const getScrollPositionForScrollIntoViewIfNeeded = (
	elem: HTMLElement,
	topOffset = 0,
	bottomOffset = 0,
	container = document.documentElement
): number => {
	if (!elem) return container.scrollTop;
	const elemTop = elem.offsetTop;
	const elemBottom = elemTop + elem.clientHeight;
	const containerTop = container.scrollTop + topOffset;
	const containerBottom = containerTop + container.clientHeight - bottomOffset;

	const toTop = () => containerTop - containerTop + elemTop;
	const toBottom = () => container.scrollTop + elemBottom - containerBottom;

	if (elemTop < containerTop) {
		return toTop();
	} else if (elemBottom > containerBottom) {
		// If scrolling to bottom would obscure top, don't scroll.
		return elemTop < toBottom() + topOffset
			? container.scrollTop
			: toBottom();
	}
	return container.scrollTop;
};

export const scrollIntoViewIfNeeded = (
	elem: HTMLElement,
	topOffset = 0,
	bottomOffset = 0,
	container = document.documentElement
) =>
	container.scrollTo(0, getScrollPositionForScrollIntoViewIfNeeded(elem, topOffset, bottomOffset, container));


export function handleTranslationChange<T>(
	obj: T,
	events: any[],
	path: string,
	changedPath: string,
	context: ContextProps,
	currentValue: string,
	newValue: string,
) {
	const doConfirm = (translationKey: string, value: string) =>
		!confirm(`${context.translations["editor.confirmDontTranslate"]}\n${translationKey}: ${value}`);

	if (newValue === undefined) {
		if (currentValue?.[0] === "@") {
			events.push({type: "translations", op: "delete", key: currentValue});
		}
		return immutableDelete(obj, changedPath);
	} else if (currentValue?.[0] === "@") {
		events.push({type: "translations", key: currentValue, value: newValue ?? ""});
		return obj;
	} else {
		const translationKey =  `@${path}${changedPath}`;
		if (isEmptyString(currentValue)) {
			return updateSafelyWithJSONPointer(obj, newValue, changedPath);
		} else if (doConfirm(changedPath, newValue)) {
			events.push(
				{
					type: "translations",
					op: "add",
					key: translationKey,
					value: ["fi", "sv", "en"].reduce((byLang, lang) => ({
						...byLang,
						[lang]: lang === context.editorLang ? newValue : currentValue
					}), {})
				});
			return updateSafelyWithJSONPointer(obj, translationKey, changedPath);
		} else {
			return updateSafelyWithJSONPointer(obj, newValue, changedPath);
		}
	}
}

type Ref<T> = { current?: T};
export const createRef = <T,>(value?: T): Ref<T> => ({current: value});

export const isSignalAbortError = (e: any): e is DOMException => e instanceof DOMException && e.name === "AbortError";

export const runAbortable = async <T,>(
	fn: (signal: AbortSignal) => Promise<T>,
	controllerRef: Ref<AbortController>
): Promise<T | DOMException> => {
	controllerRef.current?.abort();
	const controller = new AbortController();
	controllerRef.current = controller;
	try {
		return await fn(controller.signal);
	} catch (e) {
		if (!isSignalAbortError(e)) {
			throw e;
		}
		return e;
	}
};

export function useBooleanSetter(value: boolean): [boolean, () => void, () => void] {
	const [open, setOpen] = React.useState(value);
	// (complains even though inside a custom hook).
	// eslint-disable-next-line react-hooks/rules-of-hooks
	const openStateToCallback = (v: boolean) => React.useCallback(() => setOpen(v), [v]);
	return [open, openStateToCallback(true), openStateToCallback(false)];
}

/**
 * Chain two function calls.
 */
export function useChain<T>(fn1: ((...params: T[]) => void) | undefined, fn2: () => void): (...params: T[]) => void {
	return React.useCallback((...params: T[]) => {
		fn1?.(...params);
		fn2();
	}, [fn1, fn2]);
}

export const fullHeightWithOffset = (offset: number) => `calc(100% - ${offset}px)`;

export const promisify = <T, R>(fn: (params: T, callback: (result?: R) => void) => void) => 
	(params: T) => new Promise<R | void>(resolve => fn(params, resolve));
