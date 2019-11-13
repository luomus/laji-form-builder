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
	}
	export = utils;
}
