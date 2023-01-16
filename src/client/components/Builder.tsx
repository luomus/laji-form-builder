import * as React from "react";
import { Notifier } from "laji-form/lib/components/LajiForm";
import { Theme } from "laji-form/lib/themes/theme";
import { updateSafelyWithJSONPointer, immutableDelete, constructTranslations } from "laji-form/lib/utils";
import { unprefixProp, translate } from "../../utils";
import { fieldPointerToUiSchemaPointer, makeCancellable, CancellablePromise, gnmspc } from "../utils";
import { Editor } from "./Editor/Editor";
import { Context, ContextProps } from "./Context";
import appTranslations from "../translations.json";
import { Property, PropertyRange, Lang, Master, SchemaFormat, Field, CompleteTranslations, ExpandedMaster,
	isFormExtensionField, JSON } from "../../model";
import MetadataService from "../../services/metadata-service";
import FormService from "../services/form-service";
import memoize from "memoizee";
import { FormCreatorWizard } from "./Wizard";
import ApiClient from "../../api-client";
import { ApiClientImplementation } from "laji-form/lib/ApiClient";
import FormExpanderService from "../../services/form-expander-service";
import { getDiff } from "./Editor/DiffViewer";

export interface BuilderProps {
	lang: Lang;
	onChange: (form: any) => void;
	onLangChange: (lang: Lang) => void;
	apiClient: ApiClientImplementation;
	theme: Theme;
	primaryDataBankFormID: string;
	secondaryDataBankFormID: string;
	id?: string;
	notifier?: Notifier;
	displaySchemaTabs?: boolean;
	formApiClient?: ApiClientImplementation;
	allowList?: boolean;
	onSelected?: (id: string) => void;
	onRemountLajiForm?: () => void;
}
export interface BuilderState {
	id?: string;
	master?: Master;
	expandedMaster?: ExpandedMaster;
	tmpMaster?: Master;
	tmpExpandedMaster?: ExpandedMaster;
	schemaFormat?: MaybeError<SchemaFormat>;
	errorMsg?: string;
	lang: Lang;
	editorHeight?: number;
	tmp?: boolean;
	saving?: boolean
	loading?: boolean;
	edited?: boolean;
}

export type MaybeError<T> = T | "error";

export function isValid<T>(maybeError: MaybeError<T>): maybeError is T {
	return maybeError !== "error";
}

const EDITOR_HEIGHT = 400;

export default class Builder extends React.PureComponent<BuilderProps, BuilderState> {
	apiClient: ApiClient;
	formApiClient?: ApiClient;
	state: BuilderState = {
		lang: this.props.lang,
		editorHeight: EDITOR_HEIGHT
	};
	appTranslations: {[key: string]: {[lang in Lang]: string}};
	schemaFormatPromise: CancellablePromise<any>;
	formPromise: CancellablePromise<any>;
	metadataService: MetadataService;
	formService: FormService;
	formLinkerService: FormExpanderService;
	notifier: Notifier;

	static defaultProps = {
		lang: "fi" as Lang,
		displaySchemaTabs: true
	};

	constructor(props: BuilderProps) {
		super(props);
		this.apiClient = new ApiClient(props.apiClient, props.lang);
		if (props.formApiClient) {
			this.formApiClient = new ApiClient(props.formApiClient);
		}

		this.appTranslations = constructTranslations(appTranslations) as any;
		this.metadataService = new MetadataService(this.apiClient, props.lang);
		this.formService = new FormService(this.apiClient, props.lang, this.formApiClient);
		this.formLinkerService = new FormExpanderService({getForm: this.formService.getMaster});
		this.notifier = props.notifier
			|| (["success", "info", "warning", "error"] as Array<keyof Notifier>).reduce((notifier, method) => {
				notifier[method] = msg =>
					console.log(`Builder notification ${method}: ${msg}`); // eslint-disable-line no-console
				return notifier;
			}, {} as Notifier);

		this.onSelected = this.onSelected.bind(this);
		this.propagateState = this.propagateState.bind(this);
	}

	componentDidMount() {
		this.updateFromId(this.props.id);
	}

	componentWillUnmount() {
		this.formPromise?.cancel();
		this.schemaFormatPromise?.cancel();
	}

	componentDidUpdate({lang: prevLang}: BuilderProps) {
		if (prevLang !== this.props.lang && this.state.lang === prevLang) {
			this.setState({lang: this.props.lang}, () => {
				this.updateLang();
			});
		}
		this.updateFromId(this.props.id);
	}

	updateFromId(id?: string) {
		if (id === this.state.id) {
			return;
		}
		this.setState({
			master: undefined,
			tmpMaster: undefined,
			tmpExpandedMaster: undefined,
			expandedMaster: undefined,
			schemaFormat: undefined,
			id
		}, () => {
			this.formPromise?.cancel();
			const formPromise = id
				? this.formService.getMaster(id)
				: Promise.resolve(undefined);
			const promise = async () => {
				const master = await formPromise;
				const expandedMaster = master
					? await this.formLinkerService.expandMaster(master)
					: undefined;
				this.setState({
					master,
					tmpMaster: master,
					expandedMaster,
					tmpExpandedMaster: expandedMaster,
				});
			};
			this.formPromise = makeCancellable(promise());
			this.updateSchemaFormat();
		});
	}

	onSelected(id: string) {
		this.props.onSelected?.(id);
	}

	updateSchemaFormat() {
		this.schemaFormatPromise?.cancel();
		const {id} = this.state;
		if (typeof id !== "string") {
			this.setState({schemaFormat: undefined, errorMsg: undefined});
			this.propagateState();
		}
		this.schemaFormatPromise = makeCancellable(
			this.updateStateFromSchemaFormatPromise(this.formService.getSchemaFormat(id as string))
		);
	}

	private async updateStateFromSchemaFormatPromise(
		schemaUpdatePromise: Promise<SchemaFormat>,
		additionalState: Partial<BuilderState> = {})
	: Promise<void> {
		this.setState(
			await this.getStateFromSchemaFormatPromise(schemaUpdatePromise, additionalState) as BuilderState,
			this.propagateState
		);
	}

	private async getStateFromSchemaFormatPromise(schemaUpdatePromise: Promise<SchemaFormat>,
		additionalState: Partial<BuilderState> = {}): Promise<Partial<BuilderState>> {
		let schemaFormat: SchemaFormat;
		try {
			schemaFormat = await schemaUpdatePromise;
			return {schemaFormat, errorMsg: undefined, ...(additionalState as any)};
		} catch (e) {
			let msg;
			try {
				msg = (await e.json()).error;
			} catch (e) {
				msg = "get.error";
			}
			return {schemaFormat: "error", errorMsg: msg, ...(additionalState as any)};
		}
	}

	onLangChange = (lang: Lang) => {
		this.setState({lang}, async () => {
			const {tmpExpandedMaster} = this.state;
			this.updateLang();
			if (!this.state.tmp) {
				this.updateSchemaFormat();
			} else if (tmpExpandedMaster) {
				this.updateStateFromSchemaFormatPromise(this.formService.masterToSchemaFormat(tmpExpandedMaster));
			}
			this.props.onLangChange(this.state.lang);
		});
	}

	private updateLang() {
		this.apiClient.setLang(this.state.lang);
		this.formApiClient?.setLang(this.state.lang);
		this.metadataService.setLang(this.state.lang);
		this.formService.setLang(this.state.lang);
	}

	getContext = memoize((lang: Lang, editorLang: Lang): ContextProps => ({
		apiClient: this.apiClient,
		lang,
		editorLang,
		translations: this.appTranslations[lang],
		metadataService: this.metadataService,
		formService: this.formService,
		theme: this.props.theme,
		notifier: this.notifier
	}))

	render() {
		const context = this.getContext(this.props.lang, this.state.lang);
		return (
			<Context.Provider value={context}>
				{
					this.props.id || this.state.tmpExpandedMaster ? (
						<React.Fragment>
							{this.renderEditor()}
							<div style={{height: this.state.editorHeight}} />
						</React.Fragment>
					) : (
						<FormCreatorWizard onCreate={this.onCreate}
						                   onChoose={this.onSelected}
						                   primaryDataBankFormID={this.props.primaryDataBankFormID}
						                   secondaryDataBankFormID={this.props.secondaryDataBankFormID}
						                   allowList={this.props.allowList} />
					)
				}
			</Context.Provider>
		);
	}

	renderEditor() {
		const {schemaFormat, tmpExpandedMaster, tmpMaster, saving, loading, edited, errorMsg} = this.state;
		return (
			<Editor
				master={tmpMaster}
				expandedMaster={tmpExpandedMaster}
				schemaFormat={schemaFormat}
				onChange={this.onEditorChange}
				onMasterChange={this.onEditorMasterChange}
				onSave={this.onSave}
				onLangChange={this.onLangChange}
				onHeightChange={this.onHeightChange}
				height={EDITOR_HEIGHT}
				saving={saving}
				loading={loading}
				edited={edited}
				displaySchemaTabs={this.props.displaySchemaTabs ?? true}
				className={gnmspc("")}
				errorMsg={errorMsg}
				onRemountLajiForm={this.props.onRemountLajiForm}
			/>
		);
	}

	onHeightChange = (editorHeight: number) => {
		this.setState({editorHeight});
	}

	onEditorMasterChange = async (event: MasterChangeEvent) => {
		const {tmpMaster} = this.state;

		if (!tmpMaster) {
			return;
		}

		this.setState({loading: true});

		const newMaster = event.value;
		try {
			const newSchemaFormat = await this.formService.masterToSchemaFormat(newMaster);
			const newExpandedMaster = await this.formLinkerService.expandMaster(newMaster);
			this.setState({
				tmpMaster: newMaster,
				schemaFormat: newSchemaFormat,
				tmpExpandedMaster: newExpandedMaster,
				loading: false,
				edited: true
			}, this.propagateState);
		} catch (e) {
			this.setState({loading: false});
		}
	}

	onEditorChange = async (events: ChangeEvent | ChangeEvent[]) => {
		const eventsAsArray = (events instanceof Array ? events : [events]);

		const {tmpMaster, schemaFormat, master, tmpExpandedMaster} = this.state;
		if (!tmpMaster || !tmpExpandedMaster) {
			return;
		}

		const sync = async () => {
			this.updateStateFromSchemaFormatPromise(
				this.formService.masterToSchemaFormat(tmpMaster),
				{tmpMaster}
			);
		};

		const syncOnBadState = (schemaFormat?: MaybeError<SchemaFormat>): schemaFormat is "error" | undefined => {
			if (!schemaFormat || !isValid(schemaFormat)) {
				sync();
				return true;
			}
			return false;
		};

		const expandTranslations = (translations: Master["translations"]): CompleteTranslations => ({
			fi: {}, sv: {}, en: {}, ...(translations || {})
		});

		this.setState({loading: true});

		let newMaster = {...tmpExpandedMaster} as Master;

		for (const event of eventsAsArray) {
			if (isUiSchemaChangeEvent(event)) {
				if (syncOnBadState(schemaFormat)) {
					return;
				}
				newMaster.uiSchema = updateSafelyWithJSONPointer(
					newMaster.uiSchema,
					event.value,
					fieldPointerToUiSchemaPointer(schemaFormat.schema, event.selected)
				);
			} else if (isTranslationsAddEvent(event)) {
				const {key, value} = event;
				newMaster.translations = ["fi", "sv", "en"].reduce((translations: any, lang: Lang) => ({
					...translations,
					[lang]: {
						...translations[lang],
						[key]: value[lang]
					}
				}), expandTranslations(newMaster.translations));
			} else if (isTranslationsChangeEvent(event)) {
				const {key, value} = event;
				newMaster.translations = ["fi", "sv", "en"].reduce((translations: any, lang: Lang) => ({
					...translations,
					[lang]: {
						...translations[lang],
						[key]: lang === this.state.lang
							? value
							: (translations[lang][key] || value)
					}
				}), expandTranslations(newMaster.translations));
			} else if (isTranslationsDeleteEvent(event)) {
				const {key} = event;
				newMaster.translations = ["fi", "sv", "en"].reduce((byLang, lang: Lang) => ({
					...byLang,
					[lang]: immutableDelete(expandTranslations(newMaster.translations)[lang], key)
				}), {} as CompleteTranslations);
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
					newMaster.fields = filterFields(newMaster as Field, splitted).fields;
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
						const fields = (newMaster.fields as Field[]) || [];
						newMaster.fields = addField(fields, splitted, event.value.property);
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
					newMaster.fields = updateField(newMaster.fields as Field[], splitted, event.value);
				}
			} else if (isOptionChangeEvent(event)) {
				const {path, value} = event;
				newMaster = updateSafelyWithJSONPointer(newMaster, value, path);
			}
		}

		if (tmpMaster.baseFormID || tmpMaster.fields?.some(isFormExtensionField)) {
			if (!master) {
				return;
			}

			// newMaster = eventsToPatches(master, eventsAsArray);
			const diff = getDiff(tmpExpandedMaster as JSON, newMaster as JSON);

			const patches = diff.map(d => {
				const path = "/" + (d.path || []).join("/");
				switch (d.kind) {
				case "N":
					return {op: "add", path, value: d.rhs};
				case "E":
					return {op: "replace", path, value: d.rhs};
				case "D":
					return {op: "remove", path};
				}
			});

			newMaster = {...master, patch: [...(master.patch || []), ...patches]};
		}

		try {
			const newSchemaFormat = await this.formService.masterToSchemaFormat(newMaster);
			const newExpandedMaster = await this.formLinkerService.expandMaster(newMaster);
			this.setState({
				tmpMaster: newMaster,
				schemaFormat: newSchemaFormat,
				tmpExpandedMaster: newExpandedMaster,
				loading: false,
				edited: true
			}, this.propagateState);
		} catch (e) {
			this.setState({loading: false});
		}
	}

	propagateState() {
		if (!this.state.tmpExpandedMaster || !isValid(this.state.schemaFormat)) {
			return;
		}
		const {translations, fields, ...toTranslate} = this.state.tmpExpandedMaster;
		const translated = translate(toTranslate, this.state.tmpExpandedMaster.translations?.[this.state.lang] || {});
		const updated = {
			...this.state.schemaFormat,
			...translated
		};
		this.props.onChange(updated);
	}

	onSave = async (master: Master) => {
		if (!master) {
			return;
		}
		try {
			this.setState({saving: true});
			if (master.id) {
				await this.formService.update(master);
				this.setState({saving: false, id: master.id});
			} else {
				const masterResponse = await this.formService.create(master);
				this.setState({master: masterResponse, saving: false}, this.propagateState);
				this.onSelected(masterResponse.id);
			}
			this.notifier.success(this.getContext(this.props.lang, this.state.lang).translations["Save.success"]);
		} catch (e) {
			this.notifier.error(this.getContext(this.props.lang, this.state.lang).translations["Save.error"]);
			this.setState({saving: false});
		}
	}

	onCreate = async (master: Master, save = false) => {
		if (save) {
			this.onSave(master);
			return;
		}
		const expandedMaster = await this.formLinkerService.expandMaster(master);
		this.setState({tmp: true}, () => {
			this.updateStateFromSchemaFormatPromise(
				this.formService.masterToSchemaFormat(master),
				{tmpMaster: master, tmpExpandedMaster: expandedMaster, edited: true}
			);
		});
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
