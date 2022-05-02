import fetch from "cross-fetch";
import { isObject as _isObject, parseJSONPointer as _parseJSONPointer } from "laji-form/lib/utils";
import { JSONSchemaE, Lang } from "./model";

export const translate = (obj: any, translations: {[key: string]: string}) => {
	function translate(_any: any): any {
		if (isObject(_any)) {
			return Object.keys(_any).reduce<any>((translated, key) => {
				translated[key] = translate(_any[key]);
				return translated;
			}, {});
		} else if (Array.isArray(_any)) {
			return _any.map(translate);
		}
		if (typeof _any === "string" && _any[0] === "@") {
			if (typeof translations[_any] === "string") {
				return translations[_any];
			}
			// Return the key if it doesn't have the @ prefix
			if (translations[_any.substr(1)]) {
				return translations[_any.substr(1)];
			}
		}
		return _any;
	}
	return translate(obj);
};

export class JSONSchema {
	static type = (type: string) => (options = {}) => ({type, ...options} as JSONSchemaE);
	static String = JSONSchema.type("string");
	static Number = JSONSchema.type("number");
	static Integer = JSONSchema.type("integer");
	static Boolean = JSONSchema.type("boolean");
	static array = (items: any, options = {}) => JSONSchema.type("array")({items, ...options});
	static enu = (_enum: {enum: string[], enumNames: string[]}, options?: any) => ({
		...JSONSchema.String(options),
		..._enum
	})
	static object = (properties = {}, options = {}) => JSONSchema.type("object")({properties, ...options});
}

export const parseJSONPointer = (obj: any, path: string, safeMode?: true | "createParents") => {
	return _parseJSONPointer(obj, path, safeMode, true);
};

function isPromise<T>(p: any): p is Promise<T> {
	return !!p?.then;
}

/**
 * Reduces an initial value into something else with the given reducer functions.
 * An additional value can be given, which will be provided for each reducer function as the 2nd param.
 *
 * @param initialValue The initial value that is passed to each reducer as 1st param.
 * @param reduceWith An additional value that is passed to each reducer as 2nd param.
 * @param reducers An array of functions which return the accumulated result which is passed to the next reducer.
 * The reducer can also return an observable. If the reducer is falsy, it will be skipped.
 *
 * @returns The accumulated result
 */
export function reduceWith<T, P, R = T>(
	initialValue: T | Promise<T>,
	reduceWith: P,
	reducers: (((value: T, reduceWith: P) => unknown) | undefined | false)[]
): Promise<R> {
	return reducers.reduce((promise, fn) => promise.then(
		value => fn !== false && isPromise<T>(fn)
			? fn(value as T, reduceWith)
			: Promise.resolve(fn
				? fn(value as T, reduceWith)
				: value)
	)
	, isPromise(initialValue) ? initialValue : Promise.resolve(initialValue)) as Promise<R>;
}

export const multiLang = (obj: Partial<Record<Lang, string>> | undefined, lang: Lang) =>
	!obj ? undefined : (obj[lang] ?? obj["en"]);

export const isObject = _isObject;

/**
 * Removes the name space prefix.
 *
 * Example:
 * unprefixProp("MY.document"); // returns "document"
 **/
export const unprefixProp = (s: string) => s.replace(/^.+\./, "");

export const fetchJSON = (path: string, options?: any) => fetch(path, options).then(r => r.json());

/**
 * Converts an array into a dictionary with the array items as the keys.
 *
 * Example:
 * dictionary(["a", "b"]); // returns { a: true, b: true }
 **/
export const dictionarify = (arr: string[]): Record<string, true> => arr.reduce((dict, key) => {
	dict[key] = true;
	return dict;
}, {} as Record<string, true>);
