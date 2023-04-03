import { updateSafelyWithJSONPointer, immutableDelete } from "laji-form/lib/utils";
import { unprefixProp } from "../../utils";
import { fieldPointerToUiSchemaPointer } from "../utils";
import {
	Property, PropertyRange, Lang, Master, SchemaFormat, Field, CompleteTranslations, ExpandedMaster, JSON
} from "../../model";
import { getDiff } from "../components/Editor/DiffViewer";

const expandTranslations = (translations: Master["translations"]): CompleteTranslations => ({
	fi: {}, sv: {}, en: {}, ...(translations || {})
});

export default class ChangeHandlerService {
	private lang: Lang;

	constructor(lang: Lang) {
		this.lang = lang;
	}

	setLang(lang: Lang) {
		this.lang = lang;
	}

	apply(
		tmpMaster: Master,
		tmpExpandedMaster: ExpandedMaster,
		schemaFormat: SchemaFormat,
		events: ChangeEvent | ChangeEvent[]
	) {
		const eventsAsArray = (events instanceof Array ? events : [events]);
		let newMaster = {...tmpExpandedMaster} as Master;

		for (const event of eventsAsArray) {
			newMaster = this.applyEvent(newMaster, schemaFormat, event);
		}

		return tmpMaster.baseFormID || tmpMaster.fieldsFormID
			? this.applyChangesAsPatches(tmpExpandedMaster, tmpMaster, newMaster)
			: newMaster;
	}
	
	private applyEvent(master: Master, schemaFormat: SchemaFormat, event: ChangeEvent): Master {
		if (isUiSchemaChangeEvent(event)) {
			return {...master, uiSchema: updateSafelyWithJSONPointer(
				master.uiSchema,
				event.value,
				fieldPointerToUiSchemaPointer(schemaFormat.schema, event.selected)
			)};
		} else if (isTranslationsAddEvent(event)) {
			const {key, value} = event;
			return {...master, translations: ["fi", "sv", "en"].reduce((translations: any, lang: Lang) => ({
				...translations,
				[lang]: {
					...translations[lang],
					[key]: value[lang]
				}
			}), expandTranslations(master.translations))};
		} else if (isTranslationsChangeEvent(event)) {
			const {key, value} = event;
			return {...master, translations: ["fi", "sv", "en"].reduce((translations: any, lang: Lang) => ({
				...translations,
				[lang]: {
					...translations[lang],
					[key]: lang === this.lang
						? value
						: (translations[lang][key] || value)
				}
			}), expandTranslations(master.translations))};
		} else if (isTranslationsDeleteEvent(event)) {
			const {key} = event;
			return {...master, translations: ["fi", "sv", "en"].reduce((byLang, lang: Lang) => ({
				...byLang,
				[lang]: immutableDelete(expandTranslations(master.translations)[lang], key)
			}), {} as CompleteTranslations)};
		} else if (event.type === "field") {
			const splitted = event.selected.split("/").filter(s => s);
			if (isFieldDeleteEvent(event)) {
				const filterFields = (field: Field, pointer: string[]): Field => {
					const [p, ...remaining] = pointer;
					return {
						...field,
						fields: remaining.length
							? (field.fields as Field[]).map(
								(f: Field) => f.name === p ? filterFields(f, remaining) : f)
							: (field.fields as Field[]).filter((f: Field) => f.name !== p)
					};
				};
				return {...master, fields: filterFields(master as Field, splitted).fields};
			} else if (isFieldAddEvent(event)) {
				const propertyModel = event.value;
				if (propertyModel.range[0] !== PropertyRange.Id) {
					const addField = (fields: Field[], path: string[], property: string) : Field[] => {
						if (!path.length) {
							return [...fields, {name: unprefixProp(property)}];
						}
						const [next, ...remaining] = path;
						return fields.map(field => field.name === next
							? {...field, fields: addField(field.fields || [], remaining, property)}
							: field
						);
					};
					const fields = (master.fields as Field[]) || [];
					return {...master, fields: addField(fields, splitted, event.value.property)};
				}
			} else if (isFieldUpdateEvent(event)) {
				const updateField = (fields: Field[], path: string[], value: Field): Field[] => {
					if (path.length === 1) {
						return fields.map(field => field.name === value.name ? value : field);
					}
					const [next, ...remaining] = path;
					return fields.map(field => field.name === next
						? {...field, fields: updateField(field.fields as Field[], remaining, value)}
						: field
					);
				};
				return {...master, fields: updateField(master.fields as Field[], splitted, event.value)};
			}
		} else if (isOptionChangeEvent(event)) {
			const {path, value} = event;
			return updateSafelyWithJSONPointer(master, value, path);
		}
		throw new Error("Unhandled error");
	}

	private applyChangesAsPatches(tmpExpandedMaster: ExpandedMaster, tmpMaster: Master, newMaster: Master) {
		const diff = getDiff(tmpExpandedMaster as JSON, newMaster as JSON);

		let patchedMaster = tmpMaster;

		const patches: any[] = [];
		diff.forEach(d => {
			const path = "/" + (d.path || []).join("/");
			const editedProp: keyof Master = d.path[0];
			if (editedProp === "translations") {
				if (d.kind === "N" || d.kind === "E") {
					const lang: Lang = d.path[1];
					const label: string = d.path[2];
					const translations = expandTranslations(patchedMaster.translations);
					patchedMaster = {
						...patchedMaster,
						translations: {
							...translations,
							[lang]: {...translations[lang], [label]: d.rhs}
						}
					};
				} else if (d.kind === "D") {
					const lang: Lang = d.path[1];
					const label: string = d.path[2];
					const translations = expandTranslations(patchedMaster.translations);
					patchedMaster = {
						...patchedMaster,
						translations: {
							...translations,
							[lang]: immutableDelete(translations, label)
						}
					};
				}
			} else {
				switch (d.kind) {
				case "N":
					patches.push({op: "add", path, value: d.rhs});
					break;
				case "E":
					patches.push({op: "replace", path, value: d.rhs});
					break;
				case "D":
					patches.push({op: "remove", path});
				}
			}
		});

		return {...patchedMaster, patch: [...(patchedMaster.patch || []), ...patches]};
	}
}

export type UiSchemaChangeEvent = {
	type: "uiSchema";
	value: any;
	selected: string;
}
function isUiSchemaChangeEvent(event: ChangeEvent): event is UiSchemaChangeEvent {
	return event.type === "uiSchema";
}
export type TranslationsEvent = {
	type: "translations";
	key: any;
	op?: string;
}
export type TranslationsAddEvent = TranslationsEvent & {
	value: {[lang in Lang]: string};
	op: "add";
}
export type TranslationsChangeEvent = TranslationsEvent & {
	value: any;
}
export type TranslationsDeleteEvent = TranslationsEvent & {
	op: "delete";
}
function isTranslationsAddEvent(event: ChangeEvent): event is TranslationsAddEvent {
	return event.type === "translations" && event.op === "add";
}
function isTranslationsChangeEvent(event: ChangeEvent): event is TranslationsChangeEvent {
	return event.type === "translations" && !event.op;
}
function isTranslationsDeleteEvent(event: ChangeEvent): event is TranslationsDeleteEvent {
	return event.type === "translations" && event.op === "delete";
}
export type FieldEvent = {
	type: "field";
	selected: string;
	op: string;
}
export type FieldDeleteEvent = FieldEvent & {
	op: "delete";
}
export type FieldAddEvent = FieldEvent & {
	op: "add";
	value: Property;
}
export type FieldUpdateEvent =  FieldEvent & {
	op: "update";
	value: Field;
}
function isFieldDeleteEvent(event: ChangeEvent): event is FieldDeleteEvent {
	return event.type === "field" &&  event.op === "delete";
}
function isFieldAddEvent(event: ChangeEvent): event is FieldAddEvent {
	return event.type === "field" &&  event.op === "add";
}
function isFieldUpdateEvent(event: ChangeEvent): event is FieldUpdateEvent {
	return event.type === "field" &&  event.op === "update";
}

export type OptionChangeEvent = {
	type: "options";
	value: any;
	path: string;
}
function isOptionChangeEvent(event: ChangeEvent): event is OptionChangeEvent {
	return event.type === "options";
}

export type MasterChangeEvent = {
	type: "master";
	value: Master;
}

export type ChangeEvent = UiSchemaChangeEvent
	| TranslationsAddEvent
	| TranslationsChangeEvent
	| TranslationsDeleteEvent
	| FieldDeleteEvent
	| FieldAddEvent
	| FieldUpdateEvent
	| OptionChangeEvent;
