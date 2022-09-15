import fetch from "cross-fetch";
import { JSONSchema7 } from "json-schema";
import { isObject as _isObject, parseJSONPointer as _parseJSONPointer } from "laji-form/lib/utils";
import { JSONSchema7WithEnums, Lang } from "./model";

export const translate = <T>(obj: T, translations: Record<string, string>): T => {
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

type EVOptions = Record<string, unknown>;

export class JSONSchema {
	static type = (type: string) => (options = {}) => ({type, ...options} as JSONSchema7);
	static String = JSONSchema.type("string");
	static Number = JSONSchema.type("number");
	static Integer = JSONSchema.type("integer");
	static Boolean = JSONSchema.type("boolean");
	static array = (items: any, options = {}) => JSONSchema.type("array")({items, ...options});
	static object = (properties = {}, options = {}) => JSONSchema.type("object")({properties, ...options});

	static enu(_enum: {enum: string[], enumNames: string[]})
		: JSONSchema7;
	static enu(_enum: {enum: string[], enumNames: string[]}, options: EVOptions)
		: JSONSchema7;
	static enu(_enum: {enum: string[], enumNames: string[]}, options: EVOptions | undefined, useEnums: false)
		: JSONSchema7;
	static enu(_enum: {enum: string[], enumNames: string[]}, options: EVOptions | undefined, useEnums: true)
		: JSONSchema7WithEnums;
	static enu(_enum: {enum: string[], enumNames: string[]}, options: EVOptions  | undefined, useEnums: boolean)
		: JSONSchema7 | JSONSchema7WithEnums;
	static enu(_enum: {enum: string[], enumNames: string[]}, options?: EVOptions, useEnums = false)
		: JSONSchema7 | JSONSchema7WithEnums {
		return {
			...JSONSchema.String(options),
			...(!useEnums
				? {oneOf: _enum.enum.reduce((oneOf, enu, idx) => {
					oneOf.push({const: enu, title: _enum.enumNames[idx]});
					return oneOf;
				}, [] as {const: string, title: string}[])}
				: _enum)
		};
	}
}

export const parseJSONPointer = (obj: any, path: string, safeMode?: true | "createParents") => {
	return _parseJSONPointer(obj, path, safeMode, true);
};

function isPromise<T>(p: any): p is Promise<T> {
	return !!p?.then;
}

interface Reducer<T, R, P> {
	(value: T, reduceWith: P): R | Promise<R>;
}

export const bypass = <T>(any: T): T => any;

/**
 * Reduces an initial value into something else with the given reducer functions.
 * An additional value can be given, which will be provided for each reducer function as the 2nd param.
 *
 * @param initialValue The initial value that is passed to each reducer as 1st param.
 * @param reduceWith An additional value that is passed to each reducer as 2nd param.
 * @param {...reducers} Functions which return the accumulated result which is passed to the next reducer.
 *
 * @returns The accumulated result.
 */
/* eslint-disable max-len */
function reduceWith<T, P>(initialValue: T | Promise<T>, reduceWith: P): Promise<T>;
function reduceWith<T, P, A>(initialValue: T | Promise<T>, reduceWith: P, op1: Reducer<T, A, P>): Promise<A>;
function reduceWith<T, P, A, B>(initialValue: T | Promise<T>, reduceWith: P, op1: Reducer<T, A, P>, op2: Reducer<A, B, P>): Promise<B>;
function reduceWith<T, P, A, B, C>(initialValue: T | Promise<T>, reduceWith: P, op1: Reducer<T, A, P>, op2: Reducer<A, B, P>, op3: Reducer<B, C, P>): Promise<C>;
function reduceWith<T, P, A, B, C, D>(initialValue: T | Promise<T>, reduceWith: P, op1: Reducer<T, A, P>, op2: Reducer<A, B, P>, op3: Reducer<B, C, P>, op4: Reducer<C, D, P>): Promise<D>;
function reduceWith<T, P, A, B, C, D, E>(initialValue: T | Promise<T>, reduceWith: P, op1: Reducer<T, A, P>, op2: Reducer<A, B, P>, op3: Reducer<B, C, P>, op4: Reducer<C, D, P>, op5: Reducer<D, E, P>): Promise<E>;
function reduceWith<T, P, A, B, C, D, E, F>(initialValue: T | Promise<T>, reduceWith: P, op1: Reducer<T, A, P>, op2: Reducer<A, B, P>, op3: Reducer<B, C, P>, op4: Reducer<C, D, P>, op5: Reducer<D, E, P>, op6: Reducer<E, F, P>): Promise<F>;
function reduceWith<T, P, A, B, C, D, E, F, G>(initialValue: T | Promise<T>, reduceWith: P, op1: Reducer<T, A, P>, op2: Reducer<A, B, P>, op3: Reducer<B, C, P>, op4: Reducer<C, D, P>, op5: Reducer<D, E, P>, op6: Reducer<E, F, P>, op7: Reducer<F, G, P>): Promise<G>;
function reduceWith<T, P, A, B, C, D, E, F, G, H>(initialValue: T | Promise<T>, reduceWith: P, op1: Reducer<T, A, P>, op2: Reducer<A, B, P>, op3: Reducer<B, C, P>, op4: Reducer<C, D, P>, op5: Reducer<D, E, P>, op6: Reducer<E, F, P>, op7: Reducer<F, G, P>, op8: Reducer<G, H, P>): Promise<H>;
function reduceWith<T, P, A, B, C, D, E, F, G, H, I>(initialValue: T | Promise<T>, reduceWith: P, op1: Reducer<T, A, P>, op2: Reducer<A, B, P>, op3: Reducer<B, C, P>, op4: Reducer<C, D, P>, op5: Reducer<D, E, P>, op6: Reducer<E, F, P>, op7: Reducer<F, G, P>, op8: Reducer<G, H, P>, op9: Reducer<H, I, P>): Promise<I>;
function reduceWith<T, P>(initialValue: T | Promise<T>, reduceWith: P, ...reducers: Reducer<any, any, P>[]): Promise<any> {
	return reducers.reduce((promise, fn) => promise.then(
		value => isPromise(fn)
			? fn(value, reduceWith)
			: Promise.resolve(fn(value, reduceWith))
	)
	, isPromise(initialValue) ? initialValue : Promise.resolve(initialValue));
}
/* eslint-enable max-len */

export { reduceWith }; 

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

export const fetchJSON = <T>(path: string, options?: any) => fetch(path, options).then(r => r.json() as unknown as T);

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

export const dictionarifyByKey = <T extends Record<string, unknown>>(objects: T[], key: keyof T) =>
	objects.reduce<Record<string, T>>((map, obj) => {
		map[obj[key] as string] = obj;
		return map;
	}, {});

export const getPropertyContextName = (context?: string) =>
	typeof context === "string" ? context : "MY.document";
