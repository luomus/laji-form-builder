import * as React from "react";
import ApiClient, { ApiClientImplementation } from "laji-form/lib/ApiClient";
import lajiFormTranslations from "laji-form/lib/translations";
import { Translations } from "laji-form/lib/components/LajiForm";
import * as LajiFormUtils from "laji-form/lib/utils";
const { updateSafelyWithJSONPath, immutableDelete, constructTranslations } = LajiFormUtils;
import { Button } from "./components";
import { getTranslatedUiSchema, fieldPointerToUiSchemaPointer, unprefixProp, makeCancellable, CancellablePromise, JSONSchema } from "./utils";
import { LajiFormEditor } from "./LajiFormEditor";
import { Context } from "./Context";
import appTranslations from "./translations";

export interface LajiFormBuilderProps {
	id: string;
	lang: Lang;
	onChange: (form: any) => void;
	apiClient: ApiClientImplementation;
}
export interface LajiFormBuilderState {
	id?: string;
	master?: "loading" | any;
	schemas?: "loading" | any;
	uiSchema?: any;
	lang: Lang;
	editorHeight?: number;
}

const EDITOR_HEIGHT = 400;

export default class LajiFormBuilder extends React.PureComponent<LajiFormBuilderProps, LajiFormBuilderState> {
	apiClient: ApiClient;
	state: LajiFormBuilderState = {
		master: "loading",
		schemas: "loading",
		lang: this.props.lang,
		editorHeight: EDITOR_HEIGHT
	};
	getSetLangFor: {[lang in Lang]: () => void} = ["fi", "sv", "en"].reduce((fns, lang: Lang) => ({
		...fns, [lang]: () => this.setState({lang})
	}), {} as any);
	appTranslations: {[key: string]: {[lang in Lang]: string}};
	schemasPromise: CancellablePromise<any>;

	static defaultProps = {
		lang: "fi" as Lang
	};

	constructor(props: LajiFormBuilderProps) {
		super(props);
		this.apiClient = new ApiClient(props.apiClient, props.lang || "fi", constructTranslations(lajiFormTranslations) as unknown as Translations);
		this.appTranslations = constructTranslations(appTranslations);
	}

	componentDidMount() {
		this.updateFromId(this.props.id);
	}

	componentWillUnmount() {
		this.schemasPromise?.cancel();
	}

	componentWillReceiveProps({id, lang}: LajiFormBuilderProps) {
		lang !== this.props.lang && this.apiClient?.setLang(lang);
		this.updateFromId(id);
	}

	updateFromId(id: string) {
		if (id !== this.state.id) {
			this.setState({master: "loading", schemas: "loading", id}, () => {
				// TODO fix formtest
				this.setState({master: require(`../forms/${id}.json`)});
				this.updateSchemas();
			}
			);
		}
	}

	updateSchemas() {
		this.schemasPromise?.cancel();
		const {id} = this.state;
		const {lang} = this.state;
		this.schemasPromise = makeCancellable(this.apiClient.fetch(`/forms/${id}`, {lang, format: "schema"})
			.then((data: any) => this.setState({schemas: data})));
	}

	onLangChange = (lang: Lang) => {
		this.setState({lang}, this.updateSchemas);
	}

	render() {
		return (
			<Context.Provider value={{apiClient: this.apiClient, lang: this.state.lang, translations: this.appTranslations[this.state.lang]}}>
				<div style={{ position: "absolute", display: "flex", flexDirection: "column" }}>
					{this.renderEditor()}
				</div>
				<div style={{height: this.state.editorHeight}} />
			</Context.Provider>
		);
	}

	renderEditor() {
		const {schemas, master} = this.state;
		return (
			<LajiFormEditor
				loading={master === "loading"}
				master={master}
				schemas={schemas}
				onChange={this.onEditorChange}
				onLangChange={this.onLangChange}
				onHeightChange={this.onHeightChange}
				height={EDITOR_HEIGHT}
			/>
		);
	}

	onHeightChange = (editorHeight: number) => {
		this.setState({editorHeight});
	}

	renderLangChooser = () => {
		return (
			<div className="btn-group">{
				["fi", "sv", "en"].map((lang: Lang) => (
					<Button
						active={this.state.lang === lang}
						onClick={this.getSetLangFor[lang]}
						key={lang}
					>{lang}
					</Button>
				))
			}</div>
		);
	}

	onEditorChange = (events: ChangeEvent | ChangeEvent[]) => {
		const changed: any = {master: this.state.master, schemas: this.state.schemas};
		(events instanceof Array ? events : [events]).forEach(event => {
			if (isUiSchemaChangeEvent(event)) {
				changed.master = {
					...(changed.master || {}),
					uiSchema: updateSafelyWithJSONPath(
						changed.master.uiSchema,
						event.value,
						fieldPointerToUiSchemaPointer(this.state.schemas.schema, event.selected)
					)
				};
			} else if (isTranslationsAddEvent(event)) {
				const {key, value} = event;
				changed.master = {
					...(changed.master || {}),
					translations: ["fi", "sv", "en"].reduce((translations: any, lang: Lang) => ({
						...translations,
						[lang]: {
							...translations[lang],
							[key]: value[lang]
						}
					}), this.state.master.translations)
				};
			} else if (isTranslationsChangeEvent(event)) {
				const {key, value} = event;
				changed.master = {
					...(changed.master || {}),
					translations: ["fi", "sv", "en"].reduce((translations: any, lang: Lang) => ({
						...translations,
						[lang]: {
							...translations[lang],
							[key]: lang === this.state.lang
								? value
								: (this.state.master.translations[lang][key] || value)
						}
					}), this.state.master.translations)
				};
			} else if (isTranslationsDeleteEvent(event)) {
				const {key} = event;
				changed.master = {
					...(changed.master || {}),
					translations: ["fi", "sv", "en"].reduce((byLang, lang: Lang) => ({
						...byLang,
						[lang]: immutableDelete(this.state.master.translations[lang], key)
					}), {})
				};
			} else if (event.type === "field") {
				const splitted = event.selected.split("/").filter(s => s);
				if (isFieldDeleteEvent(event)) {
					const filterFields = (field: FieldOptions, pointer: string[]): FieldOptions => {
						const [p, ...remaining] = pointer;
						return {
							...field,
							fields: remaining.length
								? (field.fields as FieldOptions[]).map((f: FieldOptions) => f.name === p ? filterFields(f, remaining) : f)
								: (field.fields as FieldOptions[]).filter((f: FieldOptions) => f.name !== p)
						};
					};
					const filterSchema = (schema: any, pointer: string[]): any => {
						const [p, ...remaining] = pointer;
						if (remaining.length) {
							if (schema.properties) {
								return {...schema, properties: {...schema.properties, [p]: filterSchema(schema.properties[p], remaining)}};
							} else {
								return {
									...schema,
									items: {
										...schema.items,
										properties: {
											...schema.items.properties,
											[p]: filterSchema(schema.items.properties[p], remaining)
										}
									}
								};
							}
						}
						if (schema.properties) {
							return {...schema, properties: immutableDelete(schema.properties, p)};
						} else {
							return {...schema, items: {...schema.items, properties: immutableDelete(schema.items.properties, p)}};
						}
					};
					changed.master = {
						...(changed.master || {}),
						fields: filterFields(changed.master, splitted).fields
					};
					changed.schemas = {
						...changed.schemas,
						schema: filterSchema(changed.schemas.schema, splitted)
					};
				} else if (isFieldAddEvent(event)) {
					const propertyModel = event.value;
					if (propertyModel.range[0] !== PropertyRange.Id) {
						const addField = (fields: FieldOptions[], path: string[], property: string): FieldOptions[] => {
							if (!path.length) {
								return [...fields, {name: property}];
							}
							const [next, ...remaining] = path;
							return fields.map(field => field.name === next
								? {...field, fields: addField(field.fields as FieldOptions[], remaining, property)}
								: field
							);
						};
						const getSchemaForProperty = (property: PropertyModel) => {
							switch (property.range[0]) {
							case PropertyRange.String:
								return JSONSchema.str;
							case PropertyRange.Boolean:
								return JSONSchema.bool;
							case PropertyRange.Int:
								return JSONSchema.integer;
							case PropertyRange.PositiveInteger: // TODO validator
								return JSONSchema.number;
							case PropertyRange.DateTime: // TODO datetime uiSchema
								return JSONSchema.str;
							default:
								throw new Error("Unknown property range");
							}
						};
						const addSchemaField = (schema: any, path: string[], property: PropertyModel): any => {
							const [next, ...remaining] = path;
							const propName = next || unprefixProp(property.property);
							const schemaForNext = !next
								? getSchemaForProperty(property)
								: addSchemaField(schema.items?.properties[next] || schema.properties[next], remaining, property);
							return schema.type === "object"
								? {...schema, properties: {...schema.properties, [propName]: schemaForNext}}
								: {...schema, items: {...schema.items, properties: {...schema.items.properties, [propName]: schemaForNext}}};
						};
						changed.master = {
							...changed.master,
							fields: addField(changed.master.fields, splitted, event.value.property),
						};
						changed.schemas = {
							...changed.schemas,
							schema: addSchemaField(changed.schemas.schema, splitted, event.value)
						};
					}
				} else if (isFieldUpdateEvent(event)) {
					const updateField = (fields: FieldOptions[], path: string[], value: FieldOptions): FieldOptions[] => {
						if (path.length === 1) {
							return fields.map(field => field.name === value.name ? value : field);
						}
						const [next, ...remaining] = path;
						return fields.map(field => field.name === next
							? {...field, fields: updateField(field.fields as FieldOptions[], remaining, value)}
							: field
						);
					};
					const updateValidators = (currentValidators: any, schema: any, path: string[], newValidators: any): any | undefined => {
						const [next, ...remaining] = path;
						if (next) {
							let nextCurrentValidators, nextSchema, nextPath, nextValidators;
							if (schema.items && schema.items.properties) {
								nextCurrentValidators = currentValidators?.items?.properties?.[next];
								nextSchema = schema.items.properties[next];
								nextPath =  `/items/properties/${next}`;
								nextValidators = updateValidators(nextCurrentValidators, nextSchema, remaining, newValidators);
							} else {
								nextCurrentValidators = currentValidators?.properties?.[next];
								nextSchema = schema.properties[next];
								nextPath = `/properties/${next}`;
								nextValidators = updateValidators(nextCurrentValidators, nextSchema, remaining, newValidators);
								if (nextCurrentValidators?.items) {
									nextValidators = {items: nextCurrentValidators.items, ...nextValidators};
								}
							}
							return updateSafelyWithJSONPath(currentValidators, nextValidators, nextPath);
						}
						return newValidators;
					};

					changed.master = {
						...changed.master,
						fields: updateField(changed.master.fields, splitted, event.value),
					};
					if (event.value.validators) {
						changed.schema = {
							...changed.schema,
							validators: updateValidators({properties: changed.schemas.validators}, changed.schemas.schema, splitted, event.value.validators).properties,
						};
					}
					if (event.value.warnings) {
						changed.schema = {
							...changed.schema,
							warnings: updateValidators({properties: changed.schemas.warnings}, changed.schemas.schema, splitted, event.value.warnings).properties,
						};
					}
				}
			} else if (isOptionChangeEvent(event)) {
				const {path, value} = event;
				changed.master = updateSafelyWithJSONPath(changed.master, value, path);
			}
		});
		this.setState(changed, () => {
			const uiSchema = getTranslatedUiSchema(this.state.master.uiSchema, this.state.master.translations[this.state.lang]);
			this.props.onChange({...this.state.schemas, uiSchema});
		});
	}
}

export type Lang = "fi" | "sv" | "en";

export interface UiSchemaChangeEvent {
	type: "uiSchema";
	value: any;
	selected: string;
}
function isUiSchemaChangeEvent(event: ChangeEvent): event is UiSchemaChangeEvent {
	return event.type === "uiSchema";
}
export interface TranslationsEvent {
	type: "translations";
	key: any;
	op?: string;
}
export interface TranslationsAddEvent extends TranslationsEvent {
	value: {[lang in Lang]: string};
	op: "add";
}
export interface TranslationsChangeEvent extends TranslationsEvent {
	value: any;
}
export interface TranslationsDeleteEvent extends TranslationsEvent {
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
export interface FieldEvent {
	type: "field";
	selected: string;
	op: string;
}
export interface FieldDeleteEvent extends FieldEvent {
	op: "delete";
}
export interface FieldAddEvent extends FieldEvent {
	op: "add";
	value: PropertyModel;
}
export interface FieldUpdateEvent extends FieldEvent {
	op: "update";
	value: FieldOptions;
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

export interface OptionChangeEvent {
	type: "options";
	value: any;
	path: string;
}
function isOptionChangeEvent(event: ChangeEvent): event is OptionChangeEvent {
	return event.type === "options";
}

export type ChangeEvent = UiSchemaChangeEvent
	| TranslationsAddEvent
	| TranslationsChangeEvent
	| TranslationsDeleteEvent
	| FieldDeleteEvent
	| FieldAddEvent
	| FieldUpdateEvent
	| OptionChangeEvent;

export interface Schemas {
	schema: any;
	uiSchema: any;
}

export enum PropertyRange {
	Int = "xsd:integer",
	Boolean = "xsd:boolean",
	String = "xsd:string",
	Id = "@id",
	PositiveInteger = "xsd:positiveInteger",
	DateTime = "xsd:dateTime"
}
export interface PropertyModel {
	property: string;
	label: string;
	range: PropertyRange[];
}

export interface FieldOptions {
	label?: string;
	name: string;
	options?: any;
	type?: string;
	validators?: any;
	warnings?: any;
	fields?: FieldOptions[];
}
