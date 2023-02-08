import fetch from "cross-fetch";
import { isObject as _isObject, parseJSONPointer as _parseJSONPointer } from "laji-form/lib/utils";
import { Field, JSONSchema, JSONSchemaArray, JSONSchemaBoolean, JSONSchemaEnumOneOf, JSONSchemaInteger,
	JSONSchemaNumber, JSONSchemaObject, JSONSchemaString, JSONSchemaV6Enum, Lang, Master, Property } from "./model";

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

export class JSONSchemaBuilder {
	static type = <T extends JSONSchema>(type: string) => (options = {}) => ({type, ...options} as T);
	static String = JSONSchemaBuilder.type<JSONSchemaString>("string");
	static Number = JSONSchemaBuilder.type<JSONSchemaNumber>("number");
	static Integer = JSONSchemaBuilder.type<JSONSchemaInteger>("integer");
	static Boolean = JSONSchemaBuilder.type<JSONSchemaBoolean>("boolean");
	static array = (items: any, options = {}) => JSONSchemaBuilder.type<JSONSchemaArray>("array")({items, ...options});
	static object = (properties = {}, options = {}) =>
		JSONSchemaBuilder.type<JSONSchemaObject>("object")({properties, ...options});

	static enu(_enum: {enum: string[], enumNames: string[]})
		: JSONSchemaEnumOneOf;
	static enu(_enum: {enum: string[], enumNames: string[]}, options: EVOptions)
		: JSONSchemaEnumOneOf;
	static enu(_enum: {enum: string[], enumNames: string[]}, options: EVOptions | undefined, useEnums: false)
		: JSONSchemaEnumOneOf;
	static enu(_enum: {enum: string[], enumNames: string[]}, options: EVOptions | undefined, useEnums: true)
		: JSONSchemaV6Enum;
	static enu(_enum: {enum: string[], enumNames: string[]}, options: EVOptions  | undefined, useEnums: boolean)
		: JSONSchemaEnumOneOf | JSONSchemaV6Enum;
	static enu(_enum: {enum: string[], enumNames: string[]}, options?: EVOptions, useEnums = false)
		: JSONSchemaEnumOneOf | JSONSchemaV6Enum {
		return {
			...JSONSchemaBuilder.String(options),
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

type Reducer<T, R, P>  = {
	(value: T, reduceWith: P): R | Promise<R>;
}

/**
 * Reduces an initial value into something else with the given reducer functions.
 * An additional value can be given, which will be provided for each reducer function as the 2nd param.
 *
 * @param initialValue The initial value that is passed to each reducer as 1st param.
 * @param reduceWith An additional value that is passed to each reducer as 2nd param.
 * @param {...reducers} Functions which return the accumulated result which is passed to the next reducer.
 *
 * @returns The accumulated result as a promise.
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

export const bypass = <T>(any: T): T => any;

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
export const dictionarify = <T, K extends string | number | symbol>
	(arr: T[], operator?: (item: T) => K): Record<K, true> =>
		arr.reduce((dict, key) => {
			dict[(operator ? operator(key) : key) as K] = true;
			return dict;
		}, {} as Record<K, true>) ;

export const dictionarifyByKey = <T extends Record<string, unknown>>(objects: T[], key: keyof T) =>
	objects.reduce<Record<string, T>>((map, obj) => {
		map[obj[key] as string] = obj;
		return map;
	}, {});

export const getPropertyContextName = (context?: string) =>
	typeof context === "string" ? context : "MY.document";

export const getRootField = (master: Pick<Master, "context">): Field => {
	return {name: unprefixProp(getPropertyContextName(master.context))};
};

export const getRootProperty = (rootField: Field): Property => {
	return {
		property: rootField.name,
		isEmbeddable: true,
		range: [rootField.name],
		label: {},
		shortName: unprefixProp(rootField.name),
		required: true,
		minOccurs: "1",
		maxOccurs: "1",
		multiLanguage: false,
		domain: []
	};
};
