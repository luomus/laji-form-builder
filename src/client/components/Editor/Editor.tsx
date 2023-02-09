import * as React from "react";
import { DraggableHeight, Clickable, Button, Stylable, Classable, Spinner, SubmittableJSONEditor,
	HasChildren, SubmittableJSONEditorProps, JSONEditor, GenericModal, GenericModalProps } from "../components";
import { classNames, nmspc, gnmspc, useBooleanSetter } from "../../utils";
import { MaybeError, isValid  } from "../Builder";
import { ChangeEvent, TranslationsAddEvent, TranslationsChangeEvent, TranslationsDeleteEvent, UiSchemaChangeEvent,
	FieldDeleteEvent, FieldUpdateEvent, MasterChangeEvent } from "../../services/change-handler-service";
import { Context } from "../Context";
import OptionsEditor from "./OptionsEditor";
import { Lang, Master, SchemaFormat, ExpandedMaster, JSON, isMaster, isJSONObject } from "../../../model";
import { translate as translateKey } from "laji-form/lib/utils";
import DiffViewer from "./DiffViewer";
import ElemPicker, { ElemPickerProps } from "./ElemPicker";
import LajiForm from "../LajiForm";
import FieldEditor from "./FieldEditor";

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
	jsonEditorOpen?: boolean;
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
		const {master, schemaFormat, errorMsg} = this.props;
		if (!master || !schemaFormat) {
			return <Spinner size={100} />;
		}
		const {translations} = this.context;
		return (
			<div style={fieldEditorStyle}>
				{isValid(master) && master.baseFormID && (
					<div className={gnmspc("warning")}>
						{translateKey(translations, "editor.warning.baseFormID", {baseFormID: master.baseFormID})}
					</div>
				)}
				{errorMsg && <div className={gnmspc("error")}>{translations[errorMsg] || errorMsg}</div>}
				<EditorMainToolbar active={this.state.activeEditorMode}
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

	renderActiveEditor() {
		const containerStyle: React.CSSProperties = {
			display: "flex",
			flexDirection: "row",
			position: "relative",
			height: "100%",
			paddingBottom: 27
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
														 selectedField={this.state.selectedField} />;
		} else if (activeEditorMode === "options") {
			content = <OptionsEditor master={expandedMaster}
			                         translations={expandedMaster.translations?.[this.context.editorLang as Lang] || {}}
			                         className={classNames(gnmspc("options-editor"), editorContentNmspc())}
			                         onChange={this.props.onChange}
			                         ref={this.optionsEditorRef}
			                         onLoaded={this.state.optionsEditorLoadedCallback}
			                         filter={this.state.optionsEditorFilter}
								               clearFilters={this.clearOptionsEditorFilters}
			/>;
		}
		return content
			? (
				<div style={containerStyle} ref={this.containerRef}>
					{content}
					{this.state.jsonEditorOpen && <FormJSONEditorModal value={master}
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
				optionsEditorLoadedCallback: () => this.setState({
					optionsEditorFilter: selected,
					optionsEditorLoadedCallback: undefined
				})
			});
		}
	}

	clearOptionsEditorFilters = () => this.setState({optionsEditorFilter: undefined});

	openJSONEditor = () => {
		this.setState({jsonEditorOpen: true});
	}

	hideJSONEditor = () => {
		this.setState({jsonEditorOpen: false});
	}
}

interface LangChooserProps {
	onChange: (lang: Lang) => void;
}

const LangChooser = React.memo(function LangChooser({onChange}: LangChooserProps) {
	const {theme, editorLang} = React.useContext(Context);
	const {ButtonGroup} = theme;
	return (
		<ButtonGroup small className={gnmspc("editor-lang-chooser")}>{
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
	return (
		<div style={{display: "flex", alignItems: "center"}} className={toolbarNmspc()}>
			<LangChooser onChange={onLangChange} />
			<ButtonGroup className={gnmspc("ml-1")}>
				<ElemPicker onSelectedField={onSelectedField}
				            onSelectedOptions={onSelectedOptions}
				            containerRef={containerRef} />
				{onRemountLajiForm && (
					<Button onClick={onRemountLajiForm} small>
						<Glyphicon glyph="refresh"  />
					</Button>
				) }
				<Button onClick={openJSONEditor} small>JSON</Button>
			</ButtonGroup>
			<EditorToolbarSeparator />
			<EditorChooser active={active} onChange={onEditorChange} displaySchemaTabs={displaySchemaTabs} />
			<div style={{marginLeft: "auto", display: "flex"}}>
				{ loading ? <Spinner className={toolbarNmspc("loader")} size={20} style={{left: 0}}/> : null }
				<EditorToolbarSeparator />
				<Button id={gnmspc("open-save-view")}
				        small
				        variant="primary"
				        disabled={!submitDisabled || saving}
				        onClick={onSave}>{translations["save"]}</Button>
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
} & Classable;

export const TabChooser = React.memo(function TabChooser<T extends string>(
	{active, onChange, tabs, className}:  TabChooserProps<T>
) {
	return (
		<div className={classNames(gnmspc("tabs"), className)} style={{display: "flex"}}>{
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
		                 submitLabel={translations["save"]} />
	</>;
});

type JSONEditorModalProps<T extends JSON> = Pick<SubmittableJSONEditorProps<T>,
	"value"
	| "validator"
	| "onChange"
	| "submitLabel">
	& {
	onHide: () => void;
	onSubmit: React.Dispatch<React.SetStateAction<T | undefined>>;
	onSubmitDraft?: React.Dispatch<React.SetStateAction<T | undefined>>;
}

const JSONEditorModal = React.memo(function JSONEditorModal<T extends JSON>(
	{value, onHide, onSubmitDraft, onChange, onSubmit, ...props}: JSONEditorModalProps<T>)
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
		<GenericModal onHide={onHideCheckForChanges}>
			<SubmittableJSONEditor  {...props}
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

const editorContentNmspc = nmspc("inner-editor");

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
	return (
		<EditorToolbar className={editorContentNmspc("tabs")}>
			{Object.keys(editorContentTabs).map((tab: EditorContentTab) =>
				<EditorTab key={tab}
				           active={activeTab === tab}
				           tab={tab}
				           translationKey={editorContentTabs[tab]}
				           onActivate={onTabChange} />
			 )}
			{children}
		</EditorToolbar>
	);
};

export const EditorToolbar = ({children, className}: HasChildren & Classable) => (
	<div style={{marginLeft: "auto", display: "flex"}} className={classNames(editorContentNmspc("toolbar"), className)}>
		{children}
	</div>
);

type EditorContentJSONTabProps<T> = {
  json?: T;
  onJSONChange: (value: T) => void;
}
type EditorContentUITabProps = {renderUI: () => React.ReactElement | null, overflow?: boolean};

export const EditorContent = {
	Toolbar: EditorContentToolbar,
	Tab: {
		JSON: <T extends JSON>({onJSONChange, json}: EditorContentJSONTabProps<T>) => {
			const [jsonEditorOpen, _openJSONEditor, closeJSONEditor] = useBooleanSetter(false);

			const {Glyphicon} = React.useContext(Context).theme;

			const buttonStyle = {position: "absolute", right: 20, top: 5};
			return (
				<div style={{position: "relative", height: "100%", overflow: "auto"}}>
					<JSONEditor validator={isJSONObject}
					            onChange={onJSONChange}
					            value={json}
					            style={{height: "100%"}}/>
					{jsonEditorOpen && (
						<JSONEditorModal onHide={closeJSONEditor}
						                 validator={isJSONObject}
						                 onSubmit={onJSONChange}
						                 value={json} />
					)}
					<Button onClick={_openJSONEditor} small style={buttonStyle}><Glyphicon glyph="new-window"/></Button>
				</div>
			);
		},
		UI: ({renderUI, overflow = true}: EditorContentUITabProps) =>
			<div style={{height: "100%", overflow: overflow ? "auto" : undefined}}>{renderUI()}</div>
	}
};

type GenericEditorContentProps<T extends JSON> = {
	initialActiveTab?: EditorContentTab
	overflowUIContent?: boolean;
} & Partial<Pick<EditorContentToolbarProps, "activeTab" | "onTabChange">>
	& EditorContentJSONTabProps<T>
	& EditorContentUITabProps

/**
 * If @param activeTab is given, then it is a controlled prop. Otherwise, the active tab is stateful.
 */
export const GenericEditorContent = <T extends JSON>(
	{initialActiveTab = "UI", activeTab, onTabChange, json, onJSONChange, renderUI, overflowUIContent = true}
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
			<EditorContent.Tab.JSON json={json} onJSONChange={onJSONChange} />
		)}
		{_activeTab === "UI" && (
			<EditorContent.Tab.UI renderUI={renderUI} overflow={overflowUIContent} />
		)}
	</>;
};
