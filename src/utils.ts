import fetch from "isomorphic-fetch";
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

export function reduceWith<T, P, R = T>(
	startValue: T | Promise<T>,
	reduceWith: P,
	fns: (((value: T, reduceWith: P) => unknown) | undefined | false)[]
): Promise<R> {
	return fns.reduce((promise, fn) => promise.then(
		value => fn !== false && isPromise<T>(fn)
			? fn(value as T, reduceWith)
			: Promise.resolve(fn
				? fn(value as T, reduceWith)
				: value)
	)
	, isPromise(startValue) ? startValue : Promise.resolve(startValue)) as Promise<R>;
}

export const multiLang = (obj: Partial<Record<Lang, string>> | undefined, lang: Lang) =>
	!obj ? undefined : (obj[lang] ?? obj["en"]);

export const isObject = _isObject;

export const unprefixProp = (s: string) => s.replace(/^.+\./, "");

export const fetchJSON = (path: string, options?: any) => fetch(path, options).then(r => r.json());
