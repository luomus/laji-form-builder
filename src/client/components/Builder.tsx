import * as React from "react";
import { Notifier } from "laji-form/lib/components/LajiForm";
import { Theme } from "laji-form/lib/themes/theme";
import { constructTranslations } from "laji-form/lib/utils";
import { translate } from "../../utils";
import { createRef, gnmspc, isSignalAbortError, runAbortable } from "../utils";
import { Editor } from "./Editor/Editor";
import { Context, ContextProps } from "./Context";
import appTranslations from "../translations.json";
import { Lang, Master, SchemaFormat, ExpandedMaster } from "../../model";
import MetadataService from "../../services/metadata-service";
import FormService from "../services/form-service";
import memoize from "memoizee";
import { FormCreatorWizard } from "./Wizard";
import ApiClient from "../../api-client";
import { ApiClientImplementation } from "laji-form/lib/ApiClient";
import FormExpanderService from "../../services/form-expander-service";
import ChangeHandlerService, {ChangeEvent, MasterChangeEvent} from "../services/change-handler-service";

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
	lang: Lang;
	editorHeight: number;
	loading: number;
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
		loading: 0
	};
	private apiClient: ApiClient;
	private formApiClient?: ApiClient;
	private appTranslations: {[key: string]: {[lang in Lang]: string}};
	private metadataService: MetadataService;
	private formService: FormService;
	private formLinkerService: FormExpanderService;
	private changeHandlerService: ChangeHandlerService;
	private notifier: Notifier;

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

	componentDidUpdate(
		{lang: prevLang}: BuilderProps,
		{schemaFormat: prevSchemaFormat, lang: prevStateLang}: BuilderState
	) {
		if (prevLang !== this.props.lang && this.state.lang === prevLang) {
			this.setState({lang: this.props.lang}, () => {
				this.setLangForServices();
			});
		}
		this.updateFromId(this.props.id);
		if (prevSchemaFormat !== this.state.schemaFormat || this.state.lang !== prevStateLang) {
			this.propagateState();
		}
	}

	formAbortControllerRef = createRef<AbortController>();

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
			runAbortable(async (signal: AbortSignal) => {
				const master = id
					? await this.formService.getMaster(id, signal)
					: undefined;
				this.updateMaster(master);
			}, this.formAbortControllerRef);
		});
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
			this.setState(this.getStateFromMasterUpdate(state));
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

	getStateFromMasterUpdate = (state: Pick<BuilderState, "master" | "expandedMaster" | "schemaFormat">) => ({
		...state,
		tmpMaster: state.master,
		tmpExpandedMaster: state.expandedMaster,
	})

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

	onLangChange = (lang: Lang) => {
		this.pushLoading();
		this.setState({lang}, async () => {
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
		});
	}

	private setLangForServices() {
		this.apiClient.setLang(this.state.lang);
		this.formApiClient?.setLang(this.state.lang);
		this.metadataService.setLang(this.state.lang);
		this.formService.setLang(this.state.lang);
		this.changeHandlerService.setLang(this.state.lang);
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
		const {master, schemaFormat, tmpExpandedMaster, tmpMaster, saving, loading, errorMsg} = this.state;
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
				submitDisabled={!isValid(master) || !isValid(tmpMaster) || master !== tmpMaster || !master?.id}
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
				const {translations} = this.getContext(this.props.lang, this.state.lang);
				this.notifier.error(
					`${translations["Builder.masterChange.fail"]}\n${rootError.message}\n${rootError.stack}`
				);
				console.error(rootError);
			} else {
				this.setState(newState);
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
		try {
			this.setState({saving: true});
			if (master.id) {
				const updatedMaster = await this.formService.update(master);
				this.setState({saving: false, id: master.id});
				if (master.id === updatedMaster.id) { // else componentDidUpdate() will handle updating from changed id.
					this.updateMaster(updatedMaster);
				}
			} else {
				const masterResponse = await this.formService.create(master);
				this.setState({master: masterResponse, saving: false, id: masterResponse.id});
				this.onSelected(masterResponse.id);
			}
			this.notifier.success(this.getContext(this.props.lang, this.state.lang).translations["Save.success"]);
			return true;
		} catch (e) {
			this.notifier.error(this.getContext(this.props.lang, this.state.lang).translations["Save.error"]);
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
