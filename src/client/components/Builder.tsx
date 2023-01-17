import * as React from "react";
import { Notifier } from "laji-form/lib/components/LajiForm";
import { Theme } from "laji-form/lib/themes/theme";
import { constructTranslations } from "laji-form/lib/utils";
import { translate } from "../../utils";
import { makeCancellable, CancellablePromise, gnmspc } from "../utils";
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
	changeHandlerService: ChangeHandlerService;
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
			if (tmpExpandedMaster) {
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
		const {tmpMaster, schemaFormat, tmpExpandedMaster} = this.state;
		if (!tmpMaster || !tmpExpandedMaster) {
			return;
		}

		const sync = async () => {
			this.updateStateFromSchemaFormatPromise(
				this.formService.masterToSchemaFormat(tmpMaster),
				{tmpMaster}
			);
		};

		if (!schemaFormat || !isValid(schemaFormat)) {
			sync();
			return;
		}

		this.setState({loading: true});

		const newMaster = this.changeHandlerService.apply(tmpMaster, tmpExpandedMaster, schemaFormat, events);

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

