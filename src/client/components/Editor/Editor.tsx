import * as React from "react";
import { DraggableHeight, Clickable, Button, Stylable, Classable, Spinner, SubmittableJSONEditor,
	HasChildren, SubmittableJSONEditorProps, JSONEditor, GenericModal, GenericModalProps, JSONEditorProps,
	ErrorBoundary, Tooltip, TooltipCompatible
} from "src/client/components/components";
import { classNames, nmspc, gnmspc, useBooleanSetter, fullHeightWithOffset } from "src/client/utils";
import { MaybeError, isValid  } from "src/client/components/Builder";
import { ChangeEvent, TranslationsAddEvent, TranslationsChangeEvent, TranslationsDeleteEvent, UiSchemaChangeEvent,
	FieldDeleteEvent, FieldUpdateEvent, MasterChangeEvent } from "src/client/services/change-handler-service";
import { Context } from "src/client/components/Context";
import OptionsEditor, { FormOptionsEditorProps } from "./OptionsEditor";
import { Lang, Master, SchemaFormat, ExpandedMaster, JSON, isMaster } from "src/model";
import { translate as translateKey } from "@luomus/laji-form/lib/utils";
import DiffViewer from "./DiffViewer";
import ElemPicker, { ElemPickerProps } from "./ElemPicker";
import LajiForm from "src/client/components/LajiForm";
import FieldEditor from "./FieldEditor";
import { HierarchyButton } from "./Hierarchy";

export type FieldEditorChangeEvent =
	TranslationsAddEvent
	| TranslationsChangeEvent
	| TranslationsDeleteEvent
	| Omit<UiSchemaChangeEvent, "selected">
	| Omit<FieldDeleteEvent, "selected">
	| Omit<FieldUpdateEvent, "selected">;

export interface EditorProps extends Stylable, Classable {
	onChange: (changed: ChangeEvent | ChangeEvent[]) => void;
	onMasterChange: (event: MasterChangeEvent) => void;
	onLangChange: (lang: Lang) => void;
	onSave: (master: Master) => Promise<boolean>;
	displaySchemaTabs: boolean;
	loading: number;
	jsonEditorOpen: boolean;
	onJsonEditorOpenChange: (open: boolean) => void;
	master?: MaybeError<Master>;
	expandedMaster?: MaybeError<ExpandedMaster>;
	schemaFormat?: MaybeError<SchemaFormat>;
	height?: number;
	onHeightChange?: (height: number) => void;
	saving?: boolean;
	submitDisabled?: boolean;
	errorMsg?: string;
	onRemountLajiForm?: () => void;
}

export interface EditorState {
	activeEditorMode: ActiveEditorMode;
	pointerChoosingActive: boolean;
	optionsEditorLoadedCallback?: () => void;
	optionsEditorFilter?: string[];
	optionsActiveTab?: FormOptionsEditorProps["activeTab"];
	saveModalOpen?: Master | false;
	selectedField?: string;
}

export class Editor extends React.PureComponent<EditorProps, EditorState> {
	static contextType = Context;
	state: EditorState = {
		activeEditorMode: this.props.displaySchemaTabs ? "fields" as ActiveEditorMode : "options" as ActiveEditorMode,
		pointerChoosingActive: false
	};
	containerRef = React.createRef<HTMLDivElement>();
	optionsEditorLajiFormRef = React.createRef<typeof LajiForm>();
	optionsEditorRef = React.createRef<HTMLDivElement>();
	highlightedLajiFormElem?: HTMLElement;

	static getDerivedStateFromProps(props: EditorProps) {
		if (!props.displaySchemaTabs) {
			return {activeEditorMode: "options" as ActiveEditorMode};
		}
		return {};
	}

	render() {
		const containerStyle: React.CSSProperties = {
			display: "flex",
			flexDirection: "row",
			width: "100%"
		};
		return (
			<DraggableHeight style={containerStyle}
			                 fixed="bottom"
				               height={this.props.height}
				               className={gnmspc("editor")}
			                 containerClassName={gnmspc("")}
			                 onChange={this.onHeightChange}>
				{this.renderEditor()}
			</DraggableHeight>
		);
	}

	renderEditor() {
		const fieldEditorStyle: React.CSSProperties = {
			width: "100%"
		};
		const {master, errorMsg} = this.props;
		const {translations} = this.context;
		return (
			<div style={fieldEditorStyle}>
				{isValid(master) && master?.baseFormID && (
					<div className={gnmspc("warning")}>
						{translateKey(translations, "editor.warning.baseFormID", {baseFormID: master.baseFormID})}
					</div>
				)}
				{errorMsg && <div className={gnmspc("error")}>{translations[errorMsg] || errorMsg}</div>}
				<EditorMainToolbar master={master}
				                   active={this.state.activeEditorMode}
				                   onEditorChange={this.onActiveEditorChange}
				                   onLangChange={this.props.onLangChange}
				                   onSave={this.onWantsToSaveCurrent} 
				                   onSelectedField={this.onPickerSelectedField}
				                   onSelectedOptions={this.onPickerSelectedOptions}
				                   containerRef={this.containerRef}
				                   saving={this.props.saving}
				                   loading={this.props.loading}
				                   submitDisabled={this.props.submitDisabled}
				                   openJSONEditor={this.openJSONEditor}
				                   displaySchemaTabs={this.props.displaySchemaTabs}
				                   onRemountLajiForm={this.props.onRemountLajiForm} />
				{this.renderActiveEditor()}
			</div>
		);
	}

	hasWarning() {
		const {master} = this.props;
		return isValid(master) && !!master?.baseFormID;
	}

	getEditorContentOffset() {
		return ((this.hasWarning() ? 1 : 0) + (this.props.errorMsg ? 1 : 0))
			* 19;
	}

	renderActiveEditor() {
		const containerStyle: React.CSSProperties = {
			display: "flex",
			flexDirection: "row",
			position: "relative",
			height: "100%"
		};
		const {master, expandedMaster, schemaFormat} = this.props;
		const {activeEditorMode} = this.state;
		if (!master || !expandedMaster || !schemaFormat) {
			return <Spinner size={100} />;
		}
		let content;
		if (!isValid(master) || !isValid(expandedMaster) || !isValid(schemaFormat)) {
			content = <div className={gnmspc("error")}>{this.context.translations["editor.error.generic"]}</div>;
		} else if (activeEditorMode ===  "fields") {
			content = <FieldEditor {...this.props}
			                       expandedMaster={expandedMaster}
														 schemaFormat={schemaFormat}
														 selectedField={this.state.selectedField}
														 onSelectedField={this.onFieldSelected}
														 topOffset={this.getEditorContentOffset()} />;
								             
		} else if (activeEditorMode === "options") {
			content = <OptionsEditor master={expandedMaster}
			                         translations={expandedMaster.translations?.[this.context.editorLang as Lang] || {}}
			                         onChange={this.props.onChange}
			                         ref={this.optionsEditorRef}
															 activeTab={this.state.optionsActiveTab}
															 onTabChange={this.onTabChange}
			                         onLoaded={this.state.optionsEditorLoadedCallback}
			                         filter={this.state.optionsEditorFilter}
								               clearFilters={this.clearOptionsEditorFilters}
								               topOffset={this.getEditorContentOffset()}
			/>;
		}
		return content
			? (
				<div style={containerStyle} ref={this.containerRef} className={editorContentNmspc()}>
					{content}
					{this.props.jsonEditorOpen && <FormJSONEditorModal value={master}
					                                                   onHide={this.hideJSONEditor}
					                                                   onSave={this.onWantsToSave}
					                                                   onChange={this.props.onMasterChange} />}
					{this.state.saveModalOpen && <SaveModal master={this.state.saveModalOpen}
					                                        onSave={this.onSaveCurrent}
					                                        onHide={this.hideSaveConfirm} />}
				</div>
			) : null;
	}

	onWantsToSave = (master: Master) => {
		master.id
			? this.openSaveConfirm(master)
			: this.onSave(master);
	}

	onWantsToSaveCurrent = () => {
		const {master} = this.props;
		master && this.onWantsToSave(master);
	}

	onSaveCurrent = () => {
		const master = this.state.saveModalOpen;
		master && this.onSave(master);
	}

	onSave = async (master: Master) => {
		const saved = await this.props.onSave(master);
		saved && this.setState({saveModalOpen: false});
	}

	openSaveConfirm = (master: Master) => {
		this.setState({saveModalOpen: master});
	}

	hideSaveConfirm = () => {
		this.setState({saveModalOpen: false});
	}

	onHeightChange = ({height}: {height: number}) => {
		this.props.onHeightChange?.(height);
	}

	onActiveEditorChange = (newActive: ActiveEditorMode) => {
		this.setState({activeEditorMode: newActive});
	}

	onFieldSelected = (selectedField: string) => {
		this.setState({selectedField});
	}

	onPickerSelectedField = (selectedField: string) => {
		const state: Partial<EditorState> = {selectedField};
		if (this.state.activeEditorMode !== "fields") {
			state.activeEditorMode = "fields";
		}
		this.setState(state as EditorState);
	}

	onPickerSelectedOptions = (selected: string[]) => {
		if (this.state.activeEditorMode === "options" && this.optionsEditorLajiFormRef.current) {
			this.setState({optionsEditorFilter: selected});
		} else {
			this.setState({
				activeEditorMode: "options",
				optionsActiveTab: "UI",
				optionsEditorLoadedCallback: () => this.setState({
					optionsEditorFilter: selected,
					optionsEditorLoadedCallback: undefined
				})
			});
		}
	}

	clearOptionsEditorFilters = () => this.setState({optionsEditorFilter: undefined});

	openJSONEditor = () => {
		this.props.onJsonEditorOpenChange(true);
	}

	hideJSONEditor = () => {
		this.props.onJsonEditorOpenChange(false);
	}

	onTabChange = (tab: FormOptionsEditorProps["activeTab"]) => {
		this.setState({optionsActiveTab: tab});
	}
}

type LangChooserProps  = TooltipCompatible & {
	onChange: (lang: Lang) => void;
}

const LangChooser = React.memo(function LangChooser({onChange, ...props}: LangChooserProps) {
	const {theme, editorLang} = React.useContext(Context);
	const {ButtonGroup} = theme;
	return (
		<ButtonGroup small className={gnmspc("editor-lang-chooser")} {...props}>{
			["fi", "sv", "en"].map((_lang: Lang) =>
				<LangChooserByLang key={_lang} onChange={onChange} lang={_lang} activeLang={editorLang} />
			)
		}</ButtonGroup>
	);
});

interface LangChooserByLangProps extends LangChooserProps {
	activeLang: Lang;
	lang: Lang;
}

const LangChooserByLang = React.memo(function LangChooserByLang({lang, onChange, activeLang}: LangChooserByLangProps) {
	return (
		<Button active={lang === activeLang} onClick={React.useCallback(() => onChange(lang), [lang, onChange])}>
			{lang}
		</Button>
	);
});

type EditorMainToolbarProps = Omit<EditorChooserProps, "onChange">
	& Omit<LangChooserProps, "onChange">
	& Pick<ElemPickerProps, "onSelectedField" | "onSelectedOptions">
	& Pick<EditorProps, "master">
	& {
	onEditorChange: EditorChooserProps["onChange"];
	onLangChange: LangChooserProps["onChange"];
	onSave: () => void;
	containerRef: React.RefObject<HTMLDivElement>;
	openJSONEditor: () => void;
	loading: number;
	saving?: boolean;
	submitDisabled?: boolean;
	onRemountLajiForm?: () => void;
}

const toolbarNmspc = nmspc("editor-toolbar");

const EditorToolbarSeparator = React.memo(function EditorToolbarSeparator() {
	return <span className={toolbarNmspc("separator")}></span>;
});

const EditorMainToolbar = ({
	master,
	active,
	onEditorChange,
	onLangChange,
	onSave,
	onSelectedField,
	onSelectedOptions,
	saving,
	loading,
	submitDisabled,
	containerRef,
	displaySchemaTabs,
	openJSONEditor,
	onRemountLajiForm
}: EditorMainToolbarProps) => {
	const {translations} = React.useContext(Context);
	const {Glyphicon, ButtonGroup} = React.useContext(Context).theme;
	const saveTranslationsKey = master
		? isValid(master) && master.id
			? "editor.save.button"
			: "save"
		: undefined;
	const infoClassNames = classNames(toolbarNmspc("info"), gnmspc("mr-1"));
	const info  = master && isValid(master) && (
		<span className={infoClassNames}>
			{`${master.name ?? ""} (${master.id ? master?.id : translations["editor.info.unsaved"]})`}
		</span>
	);

	return (
		<div style={{display: "flex", alignItems: "center"}} className={toolbarNmspc()}>
			<Tooltip tooltip={translations["editor.langChooser.help"]} id="lang-choose-help">
				<LangChooser onChange={onLangChange} />
			</Tooltip>
			<ButtonGroup className={gnmspc("ml-1")}>
				<Tooltip tooltip={translations["editor.picker.help"]} id="picker-help">
					<ElemPicker onSelectedField={onSelectedField}
					            onSelectedOptions={onSelectedOptions}
					            containerRef={containerRef} />
				</Tooltip>
				{onRemountLajiForm && (
					<Tooltip tooltip={translations["editor.remount.help"]} id="remount-help">
						<Button onClick={onRemountLajiForm} disabled={!master} small>
							<Glyphicon glyph="refresh"  />
						</Button>
					</Tooltip>
				)}
				<HierarchyButton master={master} className={gnmspc("ml-1")} />
				<Tooltip tooltip={translations["editor.json.help"]} id="json-help">
					<Button onClick={openJSONEditor} disabled={!master} small>JSON</Button>
				</Tooltip>
			</ButtonGroup>
			<EditorToolbarSeparator />
			<EditorChooser active={active} onChange={onEditorChange} displaySchemaTabs={displaySchemaTabs} />
			<div style={{marginLeft: "auto", display: "flex", alignItems: "inherit"}}>
				{ loading ? <Spinner className={toolbarNmspc("loader")} size={20} style={{left: 0}}/> : null }
				{master && <EditorToolbarSeparator />}
				{info}
				{saveTranslationsKey &&
					<Button id={gnmspc("open-save-view")}
				          small
				          variant="primary"
				          disabled={submitDisabled || saving}
				          onClick={onSave}>
						{translations[saveTranslationsKey]}
					</Button>
				}
			</div>
		</div>
	);
};

type EditorChooserProps = { 
	displaySchemaTabs: boolean;
} & Omit<TabChooserProps<ActiveEditorMode>, "tabs">;

type ActiveEditorMode =  "fields" | "options";
const mainTabs = {options: "editor.tab.options", fields: "editor.tab.fields"};
const EditorChooser = React.memo(function EditorChooser(
	{displaySchemaTabs, ...props}
	: EditorChooserProps) {
	const _tabs = displaySchemaTabs ? mainTabs : {options: mainTabs.options};
	return <TabChooser {...props} tabs={_tabs} />;
});

type TabChooserProps<T extends string> = {
	tabs: Record<T, string>;
	active: T;
	onChange: (tab: T) => void;
	pills?: boolean;
} & Classable & Stylable;

export const TabChooser = React.memo(function TabChooser<T extends string>(
	{active, onChange, tabs, className, style, pills}: TabChooserProps<T>
) {
	const _className = classNames(gnmspc("tabs"), pills && gnmspc("pills"), className);
	return (
		<div className={_className} style={{display: "flex", ...(style || {})}}>{
			(Object.keys(tabs) as T[]).map(_active =>
				<EditorTab key={_active as string}
				           active={active === _active}
				           tab={_active}
				           translationKey={tabs[_active]}
				           onActivate={onChange} />
			)
		}</div>
	);
});

const EditorTab = React.memo(function EditorTab<T>(
	{tab, translationKey, active, onActivate}
	: {
		tab: T,
		translationKey: string,
		active: boolean,
		onActivate: (active: T) => void
	}) {
	const translation = (React.useContext(Context).translations as any)[translationKey] ?? translationKey;
	return (
		<Clickable className={classNames(gnmspc("tab"), active && gnmspc("active"))}
		           onClick={React.useCallback(() => onActivate(tab), [tab, onActivate])} >
			{translation}
		</Clickable>
	);
});

type FormJSONEditorProps = Omit<JSONEditorModalProps<Master>, "onChange" | "onSubmit" | "validator"> &
	{
		value: MaybeError<Master>;
		onChange: EditorProps["onMasterChange"];
		onSave: (master: Master) => void
	};

const FormJSONEditorModal = React.memo(function FormJSONEditorModal(
	{onSave, onChange, ...props}: FormJSONEditorProps)
{
	const {translations} = React.useContext(Context);

	const [tmpValue, setTmpValue] = React.useState<Master | undefined>(
		isValid(props.value) ? props.value : undefined
	);

	const onSaveChanges = React.useCallback(() => {
		tmpValue && onSave(tmpValue);
	}, [tmpValue, onSave]);

	const onSubmitDraft = React.useCallback(value =>
		onChange({type: "master", value}),
	[onChange]);

	return <>
		<JSONEditorModal {...props}
		                 value={isValid(props.value) ? props.value : undefined}
										 validator={isMaster}
		                 onSubmit={onSaveChanges}
		                 onSubmitDraft={onSubmitDraft}
		                 onChange={setTmpValue}
										 header={translations["editor.json.modal.header"]}
		                 submitLabel={translations["save"]} />
	</>;
});

type JSONEditorModalProps<T extends JSON | undefined> = Pick<SubmittableJSONEditorProps<T>,
	"value"
	| "validator"
	| "onChange"
	| "submitLabel">
	& Pick<GenericModalProps, "header">
	& {
	onHide: () => void;
	onSubmit: React.Dispatch<React.SetStateAction<T | undefined>>;
	onSubmitDraft?: React.Dispatch<React.SetStateAction<T | undefined>>;
}

const JSONEditorModal = React.memo(function JSONEditorModal<T extends JSON | undefined>(
	{value, onHide, onSubmitDraft, onChange, onSubmit, header, ...props}: JSONEditorModalProps<T>)
{
	// Focus on mount.
	const ref = React.useRef<HTMLTextAreaElement>(null);
	React.useEffect(() => ref.current?.focus(), []);

	const {translations} = React.useContext(Context);

	const [tmpValue, setTmpValue] = React.useState<T | undefined>(value);

	const _onChange = React.useCallback(value => {
		setTmpValue(value);
		onChange?.(value);
	}, [onChange]);

	const onHideCheckForChanges = React.useCallback(() => {
		tmpValue !== undefined && JSON.stringify(tmpValue) !== JSON.stringify(value)
			&& confirm(translations["editor.json.confirm"])
			&& tmpValue !== undefined && (onSubmitDraft ? onSubmitDraft(tmpValue) : onSubmit(tmpValue));
		onHide();
	}, [tmpValue, value, translations, onSubmitDraft, onSubmit, onHide]);


	return (
		<GenericModal onHide={onHideCheckForChanges} header={header}>
			<SubmittableJSONEditor {...props}
			                       value={isValid(value) ? value : undefined}
			                       onSubmitDraft={onSubmitDraft}
			                       onSubmit={onSubmit}
			                       onChange={_onChange} />
		</GenericModal>
	);
});

const SaveModal = ({onSave, onHide, master}
	: {onSave: () => void, master: MaybeError<Master>} & Pick<GenericModalProps, "onHide">) => {
	const {translations} = React.useContext(Context);
	return (
		<GenericModal onHide={onHide} className={gnmspc("save-modal")} header={translations["editor.save.header"]}>
			<div className={gnmspc("mb-5")}>{translations["editor.save.description"]}</div>
			{isValid(master)
				? <DiffViewer master={master} />
				: <div className={gnmspc("error")}>{translations["editor.saveModal.error.master"]}</div>
			}
			<Button onClick={onSave} variant="primary" disabled={!isValid(master)} >{translations["save"]}</Button>
		</GenericModal>
	);
};

export const editorContentNmspc = nmspc("editor-content");

type EditorContentToolbarProps = {
	activeTab?: EditorContentTab;
	onTabChange: (tab: EditorContentTab) => void;
} & Partial<HasChildren>;

export type EditorContentTab = "JSON" | "UI";
const editorContentTabs: Record<EditorContentTab, string> = {
	"UI": "editor.tab.fields.ui",
	"JSON": "editor.tab.fields.json"
};

export const EditorContentToolbar = ({children, onTabChange, activeTab = "UI"}
	: EditorContentToolbarProps) => {
	return <>
		<TabChooser tabs={editorContentTabs} active={activeTab} onChange={onTabChange} style={{width: "100%"}} pills />
		{children}
	</>;
};

export const EditorToolbar = ({children}: HasChildren) => (
	<div style={{marginLeft: "auto", display: "flex"}} className={editorContentNmspc("toolbar")} >
		{children}
	</div>
);

type EditorContentCommon = {
	topOffset: number;
};

type EditorContentJSONTabProps<T extends JSON | undefined> = Pick<JSONEditorProps<T>, "validator">
	& EditorContentCommon & {
  json: T;
  onJSONChange: (value: T) => void;
}
type EditorContentUITabProps = {renderUI: () => React.ReactElement | null, overflow?: boolean} & EditorContentCommon;

export const EditorContent = {
	Toolbar: EditorContentToolbar,
	Tab: {
		JSON: <T extends JSON | undefined>({onJSONChange, json, validator, topOffset}
		: EditorContentJSONTabProps<T>) => {
			const [jsonEditorOpen, _openJSONEditor, closeJSONEditor] = useBooleanSetter(false);

			const {theme ,translations} = React.useContext(Context);
			const {Glyphicon} = theme;

			const buttonStyle = {position: "absolute", right: 20, top: 5};
			return (
				<div style={{position: "relative", height: fullHeightWithOffset(topOffset), overflow: "auto"}}>
					<JSONEditor validator={validator}
					            onChange={onJSONChange}
					            value={json}
					            style={{height: "100%"}}
					            resizable={false} />
					{jsonEditorOpen && (
						<JSONEditorModal onHide={closeJSONEditor}
						                 validator={validator}
						                 onSubmit={onJSONChange}
						                 value={json} />
					)}
					<Tooltip tooltip={translations["jsonEditor.openModal"]} id="json-editor--modal" placement="left">
						<Button onClick={_openJSONEditor}
						        small
						        style={buttonStyle} >
							<Glyphicon glyph="new-window" />
						</Button>
					</Tooltip>
				</div>
			);
		},
		UI: ({renderUI, overflow = true, topOffset}: EditorContentUITabProps) =>
			<div style={{height: fullHeightWithOffset(topOffset), overflow: overflow ? "auto" : undefined}}>
			 {renderUI()}
		 </div>
	}
};
(Object.keys(editorContentTabs) as EditorContentTab[]).forEach(name =>
	(EditorContent.Tab[name] as any).displayName = `EditorContent.Tab.${name}`
);

type GenericEditorContentProps<T extends JSON | undefined> = {
	initialActiveTab?: EditorContentTab
	overflowUIContent?: boolean;
	topOffset: number;
} & Partial<Pick<EditorContentToolbarProps, "activeTab" | "onTabChange">>
	& EditorContentJSONTabProps<T>
	& EditorContentUITabProps

/** @param activeTab if given, then it is a controlled prop. Otherwise, the active tab is stateful. */
export const GenericEditorContent = <T extends JSON | undefined>(
	{initialActiveTab = "UI", activeTab, onTabChange, json, onJSONChange, validator, renderUI, overflowUIContent = true,
		topOffset}
	: GenericEditorContentProps<T>) => {
	const [stateActiveTab, onStateTabChange] = React.useState(initialActiveTab);
	const _activeTab = activeTab ?? stateActiveTab;
	const _onTabChange = React.useCallback((tab) => {
		onTabChange?.(tab);
		onStateTabChange(tab);
	}, [onTabChange, onStateTabChange]);
	return <>
		<EditorContent.Toolbar activeTab={_activeTab} onTabChange={_onTabChange} />
		{_activeTab === "JSON" && (
			<ErrorBoundary>
				<EditorContent.Tab.JSON json={json}
				                        onJSONChange={onJSONChange}
				                        validator={validator}
				                        topOffset={topOffset} />
			</ErrorBoundary>
		)}
		{_activeTab === "UI" && (
			<ErrorBoundary>
				<EditorContent.Tab.UI renderUI={renderUI} overflow={overflowUIContent} topOffset={topOffset} />
			</ErrorBoundary>
		)}
	</>;
};
