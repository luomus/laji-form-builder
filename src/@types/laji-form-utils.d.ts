declare module "laji-form/lib/utils" {
	namespace utils {
		function parseJSONPointer(object: any, jsonPointer: string, safeMode?: boolean): any;
		function parseUiSchemaFromFormDataPointer(uiSchema: any, pointer: string): any;
		function parseSchemaFromFormDataPointer(uiSchema: any, pointer: string): any;
		function updateSafelyWithJSONPath(obj: any, value: any, path: string, immutably?: boolean, createNew?: (obj: any, split: string) => any): any
		function uiSchemaJSONPointer(schema: any, JSONPointer: string): string;

	}
	export = utils;
}
