import * as React from "react";
import ApiClient, { ApiClientImplementation } from "laji-form/lib/ApiClient";
import lajiFormTranslations from "laji-form/lib/translations.json";
import { Notifier } from "laji-form/lib/components/LajiForm";
import { Theme } from "laji-form/lib/themes/theme";
import { updateSafelyWithJSONPointer, immutableDelete, constructTranslations } from "laji-form/lib/utils";
import { fieldPointerToUiSchemaPointer, unprefixProp, makeCancellable, CancellablePromise, JSONSchema, translate, gnmspc } from "../utils";
import { Editor } from "./Editor";
import { Context, ContextProps } from "./Context";
import appTranslations from "../translations.json";
import { PropertyModel, PropertyRange, Lang, Translations, Master, Schemas, Field } from "../model";
import MetadataService from "../services/metadata-service";
import FormService from "../services/form-service";
import memoize from "memoizee";
import { FormCreatorWizard } from "./Wizard";
import FieldService from "../services/field-service";

export interface BuilderProps {
	id: string;
	lang: Lang;
	onChange: (form: any) => void;
	onLangChange: (lang: Lang) => void;
	apiClient: ApiClientImplementation;
	theme: Theme;
	primaryDataBankFormID: string;
	secondaryDataBankFormID: string;
	notifier?: Notifier;
	documentFormVisible?: boolean;
}
export interface BuilderState {
	id?: string;
	master?: Master;
	schemas?: Schemas;
	lang: Lang;
	editorHeight?: number;
	tmp?: boolean;
	saving?: boolean
}

const EDITOR_HEIGHT = 400;

export default class Builder extends React.PureComponent<BuilderProps, BuilderState> {
	apiClient: ApiClient;
	state: BuilderState = {
		lang: this.props.lang,
		editorHeight: EDITOR_HEIGHT
	};
	appTranslations: {[key: string]: {[lang in Lang]: string}};
	schemasPromise: CancellablePromise<any>;
	formPromise: CancellablePromise<any>;
	metadataService: MetadataService;
	formService: FormService;
	fieldService: FieldService;
	notifier: Notifier;

	static defaultProps = {
		lang: "fi" as Lang,
		documentFormVisible: true
	};

	constructor(props: BuilderProps) {
		super(props);
		this.apiClient = new ApiClient(props.apiClient, props.lang || "fi", constructTranslations(lajiFormTranslations) as unknown as Translations);
		this.appTranslations = constructTranslations(appTranslations) as any;
		this.metadataService = new MetadataService(this.apiClient);
		this.formService = new FormService(this.apiClient);
		this.fieldService = new FieldService(this.metadataService, this.formService, props.lang);
		this.notifier = props.notifier || (["success", "info", "warning", "error"] as Array<keyof Notifier>).reduce((notifier, method) => {
			notifier[method] = msg => console.log(`Builder notification ${method}: ${msg}`); // eslint-disable-line no-console
			return notifier;
		}, {} as Notifier);
	}

	componentDidMount() {
		this.updateFromId(this.props.id);
	}

	componentWillUnmount() {
		this.formPromise?.cancel();
		this.schemasPromise?.cancel();
	}

	componentDidUpdate({lang: prevLang}: BuilderProps) {
		prevLang !== this.props.lang && this.apiClient?.setLang(this.props.lang);
		this.updateFromId(this.state.id);
	}

	updateFromId(id?: string) {
		if (id === this.state.id) {
			return;
		}
		this.formPromise?.cancel();
		this.setState({master: undefined, schemas: undefined, id}, () => {
			const formPromise = id
				? this.formService.getMaster(id)
				: Promise.resolve(undefined);
			this.formPromise = makeCancellable(formPromise
				.then((master) => this.setState({master})));
			this.updateSchemas();
		});
	}

	updateSchemas(): Promise<Schemas | undefined> {
		this.schemasPromise?.cancel();
		const {id} = this.state;
		const schemasPromise = id
			? this.formService.getSchemas(id) 
			: Promise.resolve(undefined);
		const promise = new Promise<Schemas | undefined>(resolve => schemasPromise
			.then((schemas) => this.setState({schemas}, () => resolve(schemas))));
		this.schemasPromise = makeCancellable(promise);
		return promise;
	}

	onLangChange = (lang: Lang) => {
		this.apiClient.setLang(lang);
		this.fieldService.setLang(lang);
		this.setState({lang}, async () => {
			await this.updateSchemas();
			this.props.onLangChange(this.state.lang);
			this.propagateState();
		});
	}

	getContext = memoize((lang: Lang, editorLang: Lang): ContextProps => ({
		apiClient: this.apiClient,
		lang,
		editorLang,
		translations: this.appTranslations[lang],
		metadataService: this.metadataService,
		formService: this.formService,
		theme: this.props.theme
	}))

	render() {
		const context = this.getContext(this.props.lang, this.state.lang);
		return (
			<Context.Provider value={context}>
				{
					this.props.id || this.state.tmp ? (
						<React.Fragment>
							{this.renderEditor()}
							<div style={{height: this.state.editorHeight}} />
						</React.Fragment>
					) : (
						<FormCreatorWizard onCreate={this.onCreate}
						                   primaryDataBankFormID={this.props.primaryDataBankFormID}
						                   secondaryDataBankFormID={this.props.secondaryDataBankFormID} />
					)
				}
			</Context.Provider>
		);
	}

	renderEditor() {
		const {schemas, master, saving} = this.state;
		return (
			<Editor
				master={master}
				schemas={schemas}
				onChange={this.onEditorChange}
				onSave={this.onSave}
				onLangChange={this.onLangChange}
				onHeightChange={this.onHeightChange}
				height={EDITOR_HEIGHT}
				saving={saving}
				documentFormVisible={this.props.documentFormVisible ?? true}
				className={gnmspc("")}
			/>
		);
	}

	onHeightChange = (editorHeight: number) => {
		this.setState({editorHeight});
	}

	onEditorChange = (events: ChangeEvent | ChangeEvent[]) => {
		const {master, schemas} = this.state;
		if (!master || !schemas) {
			return;
		}

		const {translations = {fi: {}, sv: {}, en: {}}} = master;
		const changed: any = {master, schemas};
		(events instanceof Array ? events : [events]).forEach(event => {
			if (isUiSchemaChangeEvent(event)) {
				changed.master = {
					...(changed.master || {}),
					uiSchema: updateSafelyWithJSONPointer(
						changed.master.uiSchema,
						event.value,
						fieldPointerToUiSchemaPointer(schemas.schema, event.selected)
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
					}), changed.master.translations || translations)
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
								: (translations[lang][key] || value)
						}
					}), changed.master.translations || translations)
				};
			} else if (isTranslationsDeleteEvent(event)) {
				const {key} = event;
				changed.master = {
					...(changed.master || {}),
					translations: ["fi", "sv", "en"].reduce((byLang, lang: Lang) => ({
						...byLang,
						[lang]: immutableDelete((changed.master.translations || translations)[lang], key)
					}), {})
				};
			} else if (event.type === "field") {
				const splitted = event.selected.split("/").filter(s => s);
				if (isFieldDeleteEvent(event)) {
					const filterFields = (field: Field, pointer: string[]): Field => {
						const [p, ...remaining] = pointer;
						return {
							...field,
							fields: remaining.length
								? (field.fields as Field[]).map((f: Field) => f.name === p ? filterFields(f, remaining) : f)
								: (field.fields as Field[]).filter((f: Field) => f.name !== p)
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
						const addField = (fields: Field[], path: string[], property: string): Field[] => {
							if (!path.length) {
								return [...fields, {name: property}];
							}
							const [next, ...remaining] = path;
							return fields.map(field => field.name === next
								? {...field, fields: addField(field.fields as Field[], remaining, property)}
								: field
							);
						};
						const getSchemaForProperty = (property: PropertyModel) => {
							switch (property.range[0]) {
							case PropertyRange.String:
								return JSONSchema.String();
							case PropertyRange.Boolean:
								return JSONSchema.Boolean();
							case PropertyRange.Int:
								return JSONSchema.Integer();
							case PropertyRange.PositiveInteger: // TODO validator
								return JSONSchema.Number();
							case PropertyRange.DateTime: // TODO datetime uiSchema
								return JSONSchema.String();
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
							return updateSafelyWithJSONPointer(currentValidators, nextValidators, nextPath);
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
				changed.master = updateSafelyWithJSONPointer(changed.master, value, path);
				changed.schemas = updateSafelyWithJSONPointer(changed.schemas, translate(value, changed.master.translations?.[this.state.lang]), path);
			}
		});
		this.setState(changed, () => {
			if (!this.state.master) {
				return;
			}
			this.propagateState();
		});
	}

	propagateState = () => {
		if (!this.state.master) {
			return;
		}
		const {translations, fields, ...toTranslate} = this.state.master; // eslint-disable-line @typescript-eslint/no-unused-vars
		const translated = translate(toTranslate, this.state.master.translations?.[this.state.lang] || {});
		const updated = {
			...this.state.schemas,
			...translated
		};
		this.props.onChange(updated);
	}

	onSave = async () => {
		if (!this.state.master) {
			return;
		}
		try {
			this.setState({saving: true});
			if (this.state.master.id) {
				await this.formService.update(this.state.master);
				this.setState({saving: false});
			} else {
				const master = await this.formService.create(this.state.master);
				this.setState({master, saving: false}, () => {
					this.propagateState();
				});
			}
			this.notifier.success(this.getContext(this.props.lang, this.state.lang).translations["save.success"]);
		} catch (e) {
			this.notifier.error(this.getContext(this.props.lang, this.state.lang).translations["save.error"]);
			this.setState({saving: false});
		}
	}

	onCreate = async (master: Master) => {
		this.setState({tmp: true}, async () => {
			const schemas = await this.fieldService.masterToJSONFormat(master);
			this.setState({master, schemas}, this.propagateState);
		});
	}
}

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