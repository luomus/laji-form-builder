import * as React from "react";
import { Notifier } from "@luomus/laji-form/lib/components/LajiForm";
import { Theme } from "@luomus/laji-form/lib/themes/theme";
import { translate } from "src/utils";
import { createRef, gnmspc, isSignalAbortError, promisify, runAbortable } from "src/client/utils";
import { Editor } from "src/client/components/Editor/Editor";
import { Context, ContextProps } from "./Context";
import appTranslations from "src/client/translations.json";
import { Lang, Master, SchemaFormat, ExpandedMaster } from "src/model";
import MetadataService from "src/services/metadata-service";
import FormService from "src/client/services/form-service";
import memoize from "memoizee";
import { FormCreatorWizard } from "./Wizard";
import ApiClient from "src/api-client";
import { ApiClientImplementation } from "@luomus/laji-form/lib/ApiClient";
import FormExpanderService from "src/services/form-expander-service";
import ChangeHandlerService, { ChangeEvent, MasterChangeEvent } from "src/client/services/change-handler-service";

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
	idToUri?: (id: string) => string;
	onRemountLajiForm?: () => void;
}
export interface BuilderState {
	lang: Lang;
	editorHeight: number;
	loading: number;
	jsonEditorOpen: boolean;
	id?: string;
	master?: MaybeError<Master>;
	expandedMaster?: MaybeError<ExpandedMaster>;
	tmpMaster?: MaybeError<Master>;
	tmpExpandedMaster?: MaybeError<ExpandedMaster>;
	schemaFormat?: MaybeError<SchemaFormat>;
	errorMsg?: string;
	saving?: boolean
}

class BuilderError extends Error {
}

const otherThanSignalAbortAsBuilderError = (e: Error) => {
	if (isSignalAbortError(e)) {
		throw e;
	}
	(e as any)._builderError = true;
	return e as BuilderError;
};

export type MaybeError<T> = T | BuilderError;

export function isValid<T>(maybeError: MaybeError<T>): maybeError is T {
	return typeof maybeError !== "object" || maybeError === null || !(maybeError as any)._builderError;
}

const EDITOR_HEIGHT = 400;

export default class Builder extends React.PureComponent<BuilderProps, BuilderState> {
	state: BuilderState = {
		lang: this.props.lang,
		editorHeight: EDITOR_HEIGHT,
		loading: 0,
		jsonEditorOpen: false
	};
	private apiClient: ApiClient;
	private formApiClient?: ApiClient;
	private metadataService: MetadataService;
	private formService: FormService;
	private formLinkerService: FormExpanderService;
	private changeHandlerService: ChangeHandlerService;
	private notifier: Notifier;

	static defaultProps = {
		lang: "fi" as Lang,
		displaySchemaTabs: true,
		allowList: true
	};

	setStateAsync = promisify(this.setState.bind(this));

	constructor(props: BuilderProps) {
		super(props);
		this.apiClient = new ApiClient(props.apiClient, props.lang);
		if (props.formApiClient) {
			this.formApiClient = new ApiClient(props.formApiClient);
		}
		this.metadataService = new MetadataService(this.apiClient, props.lang);
		this.formService = new FormService(this.apiClient, props.lang, this.formApiClient);
		this.formLinkerService = new FormExpanderService({getForm: this.formService.getMaster});
		this.changeHandlerService = new ChangeHandlerService(props.lang);
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
		this.formAbortControllerRef.current?.abort();
		this.masterAbortControllerRef.current?.abort();
	}

	async componentDidUpdate(
		{lang: prevLang}: BuilderProps,
		{schemaFormat: prevSchemaFormat, lang: prevStateLang}: BuilderState
	) {
		if (prevLang !== this.props.lang && this.state.lang === prevLang) {
			await this.setStateAsync({lang: this.props.lang});
			this.setLangForServices();
		}
		this.updateFromId(this.props.id);
		if (prevSchemaFormat !== this.state.schemaFormat || this.state.lang !== prevStateLang) {
			this.propagateState();
		}
	}

	formAbortControllerRef = createRef<AbortController>();

	async updateFromId(id?: string) {
		if (id === this.state.id) {
			return;
		}
		await this.setStateAsync({
			master: undefined,
			tmpMaster: undefined,
			tmpExpandedMaster: undefined,
			expandedMaster: undefined,
			schemaFormat: undefined,
			id
		});
		runAbortable(async (signal: AbortSignal) => {
			const master = id
				? await this.formService.getMaster(id, signal)
				: undefined;
			this.updateMaster(master);
		}, this.formAbortControllerRef);
	}

	onSelected(id: string) {
		this.props.onSelected?.(id);
	}

	masterToExpandedMaster = async (master?: MaybeError<Master>, signal?: AbortSignal) =>
		master
			? isValid(master)
				? await this.formLinkerService.expandMaster(master, signal).catch(otherThanSignalAbortAsBuilderError)
				: new BuilderError("Couldn't be derived from invalid master")
			: undefined;

	expandedMasterToSchemaFormat = async (expandedMaster?: MaybeError<ExpandedMaster>, signal?: AbortSignal) =>
		expandedMaster
			? isValid(expandedMaster)
				? await this.formService.masterToSchemaFormat(expandedMaster, signal)
					.catch(otherThanSignalAbortAsBuilderError)
				: new BuilderError("Couldn't be derived from invalid expanded master")
			: undefined;

	getDerivedStateFromMaster = async (master?: MaybeError<Master>, signal?: AbortSignal)
	: Promise<Pick<BuilderState, "master" | "expandedMaster" | "schemaFormat">> => {
		const expandedMaster = await this.masterToExpandedMaster(master, signal);
		return {master, ...(await this.getDerivedStateFromExpandedMaster(expandedMaster, signal))};
	}

	getDerivedStateFromTmpMaster = async (tmpMaster?: MaybeError<Master>, signal?: AbortSignal)
	: Promise<Pick<BuilderState, "tmpMaster" | "tmpExpandedMaster" | "schemaFormat">> => {
		const tmpExpandedMaster = await this.masterToExpandedMaster(tmpMaster, signal);
		const {schemaFormat} = await this.getDerivedStateFromExpandedMaster(tmpExpandedMaster, signal);
		return {tmpMaster, tmpExpandedMaster, schemaFormat};
	}

	getDerivedStateFromExpandedMaster = async (expandedMaster?: MaybeError<ExpandedMaster>, signal?: AbortSignal)
	: Promise<Pick<BuilderState, "expandedMaster" | "schemaFormat">> => {
		const schemaFormat = await this.expandedMasterToSchemaFormat(expandedMaster, signal);
		return {expandedMaster, schemaFormat};
	}

	masterAbortControllerRef = createRef<AbortController>();

	updateMaster(master?: MaybeError<Master>) {
		return runAbortable(async (signal: AbortSignal) => {
			const state = await this.getDerivedStateFromMaster(master, signal);
			this.setState(getStateFromMasterUpdate(state));
			return state.master;
		}, this.masterAbortControllerRef);
	}

	tmpMasterAbortControllerRef = createRef<AbortController>();

	updateTmpMaster(tmpMaster?: Master) {
		runAbortable(async (signal: AbortSignal) => {
			const state = await this.getDerivedStateFromMaster(tmpMaster, signal);
			this.setState({
				tmpMaster: state.master,
				tmpExpandedMaster: state.expandedMaster,
				schemaFormat: state.schemaFormat
			});
		}, this.tmpMasterAbortControllerRef);
	}

	pushLoading() {
		this.setState(({loading}) => ({loading: loading + 1}));
	}

	popLoading() {
		this.setState(({loading}) => {
			if (loading === 0) {
				throw new Error("Popped loader when it was 0");
			}
			return {loading: loading - 1};
		});
	}


	langChangeAbortControllerRef = createRef<AbortController>();

	onLangChange = async (lang: Lang) => {
		this.pushLoading();
		await this.setStateAsync({lang});
		const {tmpExpandedMaster} = this.state;
		this.setLangForServices();
		const schemaFormat = await runAbortable(
			signal => this.expandedMasterToSchemaFormat(tmpExpandedMaster, signal),
			this.langChangeAbortControllerRef);
		if (isSignalAbortError(schemaFormat)) {
			this.popLoading();
			return;
		}
		this.props.onLangChange(this.state.lang);
		this.setState({schemaFormat});
		this.popLoading();
	}

	private setLangForServices() {
		this.apiClient.setLang(this.state.lang);
		this.formApiClient?.setLang(this.state.lang);
		this.metadataService.setLang(this.state.lang);
		this.formService.setLang(this.state.lang);
		this.changeHandlerService.setLang(this.state.lang);
	}

	getContext = memoize((lang: Lang, editorLang: Lang, idToUri: BuilderProps["idToUri"]): ContextProps => ({
		apiClient: this.apiClient,
		lang,
		editorLang,
		translations: (Object.keys(appTranslations) as (keyof typeof appTranslations)[])
			.reduce<Record<string, string>>((trans, key) => {
				trans[key] = appTranslations[key][lang];
				return trans;
			}, {}),
		metadataService: this.metadataService,
		formService: this.formService,
		theme: this.props.theme,
		notifier: this.notifier,
		idToUri: idToUri
	}))

	render() {
		const context = this.getContext(this.props.lang, this.state.lang, this.props.idToUri);
		return (
			<Context.Provider value={context}>
				{
					this.props.id || this.state.tmpExpandedMaster ? <>
						{this.renderEditor()}
						<div style={{height: this.state.editorHeight}} />
					</> : (
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
		const {master, tmpMaster} = this.state;
		return (
			<Editor
				master={this.state.tmpMaster}
				expandedMaster={this.state.tmpExpandedMaster}
				schemaFormat={this.state.schemaFormat}
				onChange={this.onEditorChange}
				onMasterChange={this.onEditorMasterChange}
				onSave={this.onSave}
				onLangChange={this.onLangChange}
				onHeightChange={this.onHeightChange}
				height={EDITOR_HEIGHT}
				saving={this.state.saving}
				loading={this.state.loading}
				jsonEditorOpen={this.state.jsonEditorOpen}
				onJsonEditorOpenChange={this.onJsonEditorOpenChange}
				submitDisabled={!isValid(master) || !isValid(tmpMaster) || master === tmpMaster || !master?.id}
				displaySchemaTabs={this.props.displaySchemaTabs ?? true}
				className={gnmspc("")}
				errorMsg={this.state.errorMsg}
				onRemountLajiForm={this.props.onRemountLajiForm}
			/>
		);
	}

	onHeightChange = (editorHeight: number) => {
		this.setState({editorHeight});
	}

	onJsonEditorOpenChange = (open: boolean) => {
		this.setState({jsonEditorOpen: open});
	}

	onEditorMasterChangeAbortControllerRef = createRef<AbortController>();

	onEditorMasterChange = async (event: MasterChangeEvent) => {
		const {tmpMaster} = this.state;

		if (!tmpMaster) {
			return;
		}

		this.pushLoading();

		const newMaster = event.value;
		try {
			const newState = await runAbortable(
				signal => this.getDerivedStateFromTmpMaster(newMaster, signal),
				this.onEditorMasterChangeAbortControllerRef
			);

			if (isSignalAbortError(newState)) {
				return;
			}

			const rootErrorProp = (["tmpMaster", "tmpExpandedMaster", "schemaFormat"] as
				(keyof Pick<BuilderState, "tmpMaster" | "tmpExpandedMaster" | "schemaFormat">)[])
				.find(prop => !isValid(newState[prop]));
			if (rootErrorProp) {
				const rootError = this.state[rootErrorProp] as BuilderError;
				const {translations} = this.getContext(this.props.lang, this.state.lang, this.props.idToUri);
				this.notifier.error(
					`${translations["builder.masterChange.fail"]}\n${rootError.message}\n${rootError.stack}`
				);
				console.error(rootError);
			} else {
				this.setState({...newState, jsonEditorOpen: false});
			}
		} finally {
			this.popLoading();
		}
	}

	onEditorChange = async (events: ChangeEvent | ChangeEvent[]) => {
		const {tmpMaster, schemaFormat, tmpExpandedMaster} = this.state;
		if (!tmpMaster || !tmpExpandedMaster || !isValid(tmpMaster) || !isValid(tmpExpandedMaster)) {
			return;
		}

		if (!schemaFormat || !isValid(schemaFormat)) {
			this.updateTmpMaster(this.state.tmpMaster);
			return;
		}

		this.pushLoading();

		const newMaster = this.changeHandlerService.apply(tmpMaster, tmpExpandedMaster, schemaFormat, events);
		try {
			this.updateTmpMaster(newMaster);
		} finally {
			this.popLoading();
		}
	}

	propagateState() {
		const {tmpExpandedMaster} = this.state;
		if (!tmpExpandedMaster || !isValid(tmpExpandedMaster) || !isValid(this.state.schemaFormat)) {
			return;
		}
		const {translations, fields, ...toTranslate} = tmpExpandedMaster;
		const translated = translate(toTranslate, tmpExpandedMaster.translations?.[this.state.lang] || {});
		const updated = {
			...this.state.schemaFormat,
			...translated
		};
		this.props.onChange(updated);
	}

	onSave = async (master: Master) => {
		if (!master) {
			return false;
		}

		const { translations } = this.getContext(this.props.lang, this.state.lang, this.props.idToUri);
		try {
			this.setState({saving: true});
			if (master.id) {
				const updatedMaster = await this.formService.update(master);
				this.setState({saving: false, id: master.id, jsonEditorOpen: false});
				if (master.id === updatedMaster.id) { // else componentDidUpdate() will handle updating from changed id.
					this.updateMaster(updatedMaster);
				}
			} else {
				const masterResponse = await this.formService.create(master);
				this.setState({master: masterResponse, saving: false, id: masterResponse.id, jsonEditorOpen: false});
				this.onSelected(masterResponse.id);
			}
			this.notifier.success(translations["save.success"]);
			return true;
		} catch (e) {
			this.notifier.error(translations["save.error"]);
			this.setState({saving: false});
			return false;
		}
	}

	onCreate = async (master: Master, save = false) => {
		if (save) {
			this.onSave(master);
			return;
		}
		this.updateMaster(master);
	}
}

const getStateFromMasterUpdate = (state: Pick<BuilderState, "master" | "expandedMaster" | "schemaFormat">) => ({
	...state,
	tmpMaster: state.master,
	tmpExpandedMaster: state.expandedMaster,
});

