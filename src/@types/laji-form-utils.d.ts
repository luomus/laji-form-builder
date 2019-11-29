
declare module "laji-form/lib/utils" {
	namespace utils {
		function parseJSONPointer(object: any, jsonPointer: string, safeMode?: boolean): any;
		function parseUiSchemaFromFormDataPointer(uiSchema: any, pointer: string): any;
		function parseSchemaFromFormDataPointer(uiSchema: any, pointer: string): any;
		function updateSafelyWithJSONPath(obj: any, value: any, path: string, immutably?: boolean, createNew?: (obj: any, split: string) => any): any
		function uiSchemaJSONPointer(uiSchema: any, JSONPointer: string): string;
		function schemaJSONPointer(schema: any, JSONPointer: string): string;
		function isObject(maybeObject: any): boolean;
		function getInnerUiSchema(uiSchema: any): any;
		function capitalizeFirstLetter(str: string): string;
		function immutableDelete(obj: any, pointer: string): any;
		function constructTranslations(obj: any): {[key: string]: {[lang in "en" | "sv" | "fi"]: string}};
		function dictionarify<T, V>(arr: T[], getKey?: (item: T) => string, getValue?: (item: T) => V): {[key: string]: T | V};
		function dictionarify<T, V>(arr: T[], getKey?: (item: T) => string, getValue?: (item: T) => V): {[key: string]: V};
		function dictionarify<T>(arr: T[], getKey?: (item: T) => string): {[key: string]: T};
		function findNearestParentSchemaElem(elem?: Element | null): HTMLElement | undefined;
		function idSchemaIdToJSONPointer(id: string): string;
		function scrollIntoViewIfNeeded(elem: HTMLElement, topOffset?: number, bottomOffset?: number): void;
		function getUiOptions(uiSchema: any): any;
	}
	export = utils;
}
