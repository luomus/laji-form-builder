import * as React from "react";
import memoize from "memoizee";
import {
	DraggableHeight, DraggableWidth, Clickable, Button, Stylable, Classable, Spinner, FormJSONEditor, HasChildren
} from "../components";
import {
	classNames, nmspc, gnmspc, fieldPointerToSchemaPointer, fieldPointerToUiSchemaPointer, scrollIntoViewIfNeeded
} from "../../utils";
import { getPropertyContextName, parseJSONPointer, unprefixProp } from "../../../utils";
import { MaybeError, isValid  } from "../Builder";
import { ChangeEvent, TranslationsAddEvent, TranslationsChangeEvent, TranslationsDeleteEvent, UiSchemaChangeEvent,
	FieldDeleteEvent, FieldAddEvent, FieldUpdateEvent, MasterChangeEvent } from "../../services/change-handler-service";
import { Context } from "../Context";
import UiSchemaEditor from "./UiSchemaEditor";
import BasicEditor from "./BasicEditor";
import OptionsEditor from "./OptionsEditor";
import { Lang, Master, SchemaFormat, Field as FieldOptions, ExpandedMaster } from "../../../model";
import LajiForm from "laji-form/lib/components/LajiForm";
import { translate as translateKey } from "laji-form/lib/utils";
import DiffViewer from "./DiffViewer";
import ElemPicker, { ElemPickerProps } from "./ElemPicker";

export type FieldEditorChangeEvent =
	TranslationsAddEvent
	| TranslationsChangeEvent
	| TranslationsDeleteEvent
	| Omit<UiSchemaChangeEvent, "selected">
	| Omit<FieldDeleteEvent, "selected">
	| Omit<FieldAddEvent, "selected">
	| Omit<FieldUpdateEvent, "selected">;

export interface EditorProps extends Stylable, Classable {
	onChange: (changed: ChangeEvent | ChangeEvent[]) => void;
	onMasterChange: (event: MasterChangeEvent) => void;
	onLangChange: (lang: Lang) => void;
	onSave: (master: Master) => void;
	displaySchemaTabs: boolean;
	loading: number;
	master?: MaybeError<Master>;
	expandedMaster?: MaybeError<ExpandedMaster>;
	schemaFormat?: MaybeError<SchemaFormat>;
	height?: number;
	onHeightChange?: (height: number) => void;
	saving?: boolean;
	edited?: boolean;
	errorMsg?: string;
	onRemountLajiForm?: () => void;
}

export interface EditorState {
	activeEditorMode: ActiveEditorMode;
	pointerChoosingActive: boolean;
	selected?: string;
	optionsEditorLoadedCallback?: () => void;
	optionsEditorFilter?: string[];
	jsonEditorOpen?: boolean;
	saveModalOpen?: boolean;
}

class ActiveEditorErrorBoundary extends React.Component<HasChildren, {hasError: boolean}> {
	static contextType = Context;
	context!: React.ContextType<typeof Context>;
	state = {hasError: false}
	static getDerivedStateFromError() {
		return {hasError: true};
	}
	render() {
		return this.state.hasError
			? <div className={gnmspc("error")}>{this.context.translations["Editor.error.ui"]}</div>
			: this.props.children;
	}
}

export class Editor extends React.PureComponent<EditorProps, EditorState> {
	static contextType = Context;
	state: EditorState = {
		activeEditorMode: this.props.displaySchemaTabs ? "basic" as ActiveEditorMode : "options" as ActiveEditorMode,
		pointerChoosingActive: false
	};
	containerRef = React.createRef<HTMLDivElement>();
	optionsEditorLajiFormRef = React.createRef<LajiForm>();
	optionsEditorRef = React.createRef<HTMLDivElement>();
	highlightedLajiFormElem?: HTMLElement;
	fieldsRef = React.createRef<HTMLDivElement>();

	static getDerivedStateFromProps(props: EditorProps) {
		if (!props.displaySchemaTabs) {
			return {activeEditorMode: "options"};
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
						{translateKey(translations, "Editor.warning.baseFormID", {baseFormID: master.baseFormID})}
					</div>
				)}
				{errorMsg && <div className={gnmspc("error")}>{translations[errorMsg] || errorMsg}</div>}
				<EditorToolbar active={this.state.activeEditorMode}
				               onEditorChange={this.onActiveEditorChange}
				               onLangChange={this.props.onLangChange}
				               onSave={this.confirmSave} 
				               onSelectedField={this.onPickerSelectedField}
				               onSelectedOptions={this.onPickerSelectedOptions}
				               containerRef={this.containerRef}
				               saving={this.props.saving}
				               loading={this.props.loading}
				               edited={this.props.edited}
				               openJSONEditor={this.openJSONEditor}
				               displaySchemaTabs={this.props.displaySchemaTabs}
				               onRemountLajiForm={this.props.onRemountLajiForm} />
				{this.renderActiveEditor()}
			</div>
		);
	}

	renderActiveEditor() {
		const fieldsBlockStyle: React.CSSProperties = {
			display: "flex",
			flexDirection: "column",
			height: "100%",
			overflowY: "auto"
		};
		const containerStyle: React.CSSProperties = {
			display: "flex",
			flexDirection: "row",
			position: "relative",
			height: "100%",
			paddingBottom: 27
		};
		const fieldEditorContentStyle: React.CSSProperties = {
			overflow: "auto",
			height: "100%",
			width: "100%"
		};
		const {master, expandedMaster, schemaFormat} = this.props;
		const {activeEditorMode} = this.state;
		if (!master || !expandedMaster || !schemaFormat) {
			return <Spinner size={100} />;
		}
		let content;
		if (!isValid(master) || !isValid(expandedMaster) || !isValid(schemaFormat)) {
			content = <div className={gnmspc("error")}>{this.context.translations["Editor.error.generic"]}</div>;
		} else if (activeEditorMode ===  "uiSchema" || activeEditorMode === "basic") {
			content = (
				<ActiveEditorErrorBoundary>
					<DraggableWidth style={fieldsBlockStyle} className={gnmspc("editor-nav-bar")} ref={this.fieldsRef}>
						<Fields className={gnmspc("field-chooser")}
						        fields={this.getFields(expandedMaster)}
						        onSelected={this.onFieldSelected}
						        onDeleted={this.onFieldDeleted}
						        selected={this.state.selected}
						        pointer=""
						        expanded={true}
						        fieldsContainerElem={this.fieldsRef.current}
						/>
					</DraggableWidth>
					{this.state.selected && isValid(schemaFormat) && 
						<ActiveEditor key={this.state.selected}
						              active={this.state.activeEditorMode}
						              {...this.getFieldEditorProps(expandedMaster, schemaFormat)}
						              className={gnmspc("field-editor")}
						              style={fieldEditorContentStyle}
						/>
					}
				</ActiveEditorErrorBoundary>
			);
		} else if (activeEditorMode === "options") {
			content = <OptionsEditor master={expandedMaster}
			                         translations={expandedMaster.translations?.[this.context.editorLang as Lang] || {}}
			                         className={gnmspc("options-editor")}
			                         style={fieldEditorContentStyle}
			                         onChange={this.props.onChange}
			                         lajiFormRef={this.optionsEditorLajiFormRef}
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
					{this.state.jsonEditorOpen && <FormJSONEditorModal master={master || {} as Master}
					                                                   onHide={this.hideJSONEditor}
					                                                   onSave={this.onSave}
					                                                   onChange={this.props.onMasterChange} />}
					{this.state.saveModalOpen && <SaveModal master={master}
					                                        onSave={this.onSave}
					                                        onHide={this.hideSaveConfirm} />}
				</div>
			) : null;
	}

	onHeightChange = ({height}: {height: number}) => {
		this.props.onHeightChange?.(height);
	}

	getFields = memoize((master: ExpandedMaster): any => ([{
		name: unprefixProp(getPropertyContextName(master.context)),
		fields: master.fields
	}]));

	onFieldSelected = (field: string) => {
		this.setState({selected: field});
	}

	onFieldDeleted = (field: string) => {
		this.props.onChange([{type: "field", op: "delete", selected: this.getFieldPath(field)}]);
	}

	getFieldEditorProps(expandedMaster: ExpandedMaster, schemaFormat: SchemaFormat): FieldEditorProps {
		const { editorLang } = this.context;
		const selected = this.getSelected();
		const findField = (_field: FieldOptions, path: string): FieldOptions => {
			const [next, ...rest] = path.split("/").filter(s => s);
			if (next === undefined) {
				return _field;
			}
			const child  = (_field.fields as FieldOptions[])
				.find(_child => _child.name === next) as FieldOptions;
			return findField(child, rest.join("/"));
		};
		return {
			schema: parseJSONPointer(schemaFormat.schema, fieldPointerToSchemaPointer(schemaFormat.schema, selected)),
			uiSchema: parseJSONPointer(
				expandedMaster.uiSchema,
				fieldPointerToUiSchemaPointer(schemaFormat.schema, selected),
				!!"safely"
			),
			field: findField(this.getFields(expandedMaster)[0], selected),
			translations: expandedMaster.translations?.[editorLang as Lang] || {},
			path: selected,
			onChange: this.onEditorChange,
			context: expandedMaster.context
		};
	}

	onEditorChange = (events: FieldEditorChangeEvent | FieldEditorChangeEvent[]) => {
		events = (events instanceof Array ? events : [events]).map(event => {
			return { ...event, selected: this.getSelected() };
		});

		this.props.onChange(events as ChangeEvent[]);
	}

	onActiveEditorChange = (newActive: ActiveEditorMode) => {
		this.setState({activeEditorMode: newActive});
	}

	getSelected = () => this.getFieldPath(this.state.selected || "");

	getFieldPath = (path: string) => {
		const globalSlashRegexp = /\//g;
		const firstSlashSeparatedPathPart = /\/[^/]*/;
		const slashMatch = path.match(globalSlashRegexp);
		const isRootField = slashMatch && slashMatch.length === 1;
		return isRootField ? "/" : path.replace(firstSlashSeparatedPathPart, "");
	}

	onPickerSelectedField = (selected: string) => {
		const state: Partial<EditorState> = {selected};
		if (!["basic", "uiSchema"].includes(this.state.activeEditorMode)) {
			state.activeEditorMode = "basic";
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

	openSaveConfirm = () => {
		this.setState({saveModalOpen: true});
	}

	hideSaveConfirm = () => {
		this.setState({saveModalOpen: false});
	}

	confirmSave = () => {
		this.openSaveConfirm();
	}

	onSave = () => {
		const {master} = this.props;
		master && isValid(master) && this.props.onSave(master);
	}
}

export interface FieldEditorProps extends Classable {
	uiSchema: any;
	schema: any;
	field: FieldOptions;
	translations: any;
	path: string;
	onChange: (changed: FieldEditorChangeEvent | FieldEditorChangeEvent[]) => void;
	context?: string
}

type OnSelectedCB = (field: string) => void;

const Fields = React.memo(function _Fields({
	fields = [],
	onSelected,
	onDeleted,
	selected,
	pointer,
	style = {},
	className,
	expanded,
	fieldsContainerElem
} : {
	fields: FieldProps[],
	onSelected: OnSelectedCB,
	onDeleted: OnSelectedCB,
	selected?: string,
	pointer: string,
	expanded?: boolean,
	fieldsContainerElem: HTMLDivElement | null
} & Stylable & Classable) {
	return (
		<div style={{...style, display: "flex", flexDirection: "column"}} className={className}>
			{fields.map((f: FieldProps) => (
				<Field key={f.name}
				       {...f}
				       onSelected={onSelected}
				       onDeleted={onDeleted}
				       selected={selected}
				       pointer={`${pointer}/${f.name}`}
				       expanded={expanded}
				       fieldsContainerElem={fieldsContainerElem}
				/>
			))}
		</div>
	);
});

interface FieldProps extends FieldOptions {
	pointer: string;
	selected?: string;
	onSelected: OnSelectedCB;
	onDeleted: OnSelectedCB;
	fields: FieldProps[];
	expanded?: boolean;
	fieldsContainerElem: HTMLDivElement | null;
}
interface FieldState {
	expanded: boolean;
	prevSelected?: string;
	prevExpanded?: boolean;
}
class Field extends React.PureComponent<FieldProps, FieldState> {
	state = {
		expanded: this.props.expanded || Field.isSelected(this.props.selected, this.props.pointer) ||  false,
	};
	private fieldRef = React.createRef<HTMLDivElement>();
	private nmspc = nmspc("field");

	static contextType = Context;

	static getDerivedStateFromProps(nextProps: FieldProps, prevState: FieldState) {
		if (nextProps.selected !== prevState.prevSelected
			&& !Field.isChildSelected(prevState.prevSelected, nextProps.pointer)
			&& Field.isChildSelected(nextProps.selected, nextProps.pointer)
		) {
			return {expanded: true};
		}
		return {};
	}

	componentDidUpdate(prevProps: FieldProps) {
		this.scrollToIfNeeded(prevProps);
	}

	componentDidMount() {
		this.scrollToIfNeeded();
	}

	scrollToIfNeeded(prevProps?: FieldProps) {
		if ((!prevProps || !Field.isSelected(prevProps.selected, prevProps.pointer))
			&& Field.isSelected(this.props.selected, this.props.pointer)
			&& this.fieldRef.current && this.props.fieldsContainerElem
		) {
			scrollIntoViewIfNeeded(this.fieldRef.current, 0, 0, this.props.fieldsContainerElem);
		}
	}

	static isSelected(selected: string | undefined, pointer: string): boolean {
		return selected === pointer;
	}

	static isChildSelected(selected = "", pointer: string): boolean {
		return selected.startsWith(pointer);
	}

	toggleExpand = (e: React.MouseEvent<HTMLElement>) => {
		e.stopPropagation();
		this.setState({expanded: !this.state.expanded});
	}

	onThisSelected = () => {
		this.props.onSelected(this.props.pointer);
	}

	onChildSelected = (pointer: string) => {
		this.props.onSelected(pointer);
	}

	onThisDeleted = () => {
		this.props.onDeleted(this.props.pointer);
	}

	onChildDeleted = (pointer: string) => {
		this.props.onDeleted(pointer);
	}

	render() {
		const {name, fields = [], selected, pointer} = this.props;
		const expandClassName = this.nmspc(fields.length
			? this.state.expanded
				? "expanded"
				: "contracted"
			: "nonexpandable");
		const isSelected = Field.isSelected(this.props.selected, this.props.pointer);
		const containerClassName = classNames(
			this.nmspc("item"),
			this.nmspc(pointer.substr(1).replace(/\//g, "-")),
			isSelected && this.nmspc("item-selected")
		);
		return (
			<div className={classNames(this.nmspc(), isSelected && this.nmspc("selected"))} ref={this.fieldRef}>
				<Clickable
					className={containerClassName}
					onClick={this.onThisSelected}
				>
					<Clickable className={expandClassName}
					           onClick={fields.length ? this.toggleExpand : undefined}
					           key="expand" />
					<Clickable className={this.nmspc("label")}>{name}</Clickable>
					<Clickable className={this.nmspc("delete")} onClick={this.onThisDeleted} />
				</Clickable>
				{this.state.expanded && (
					<Fields
						fields={fields}
						onSelected={this.onChildSelected}
						onDeleted={this.onChildDeleted}
						selected={selected}
						pointer={pointer}
						fieldsContainerElem={this.props.fieldsContainerElem}
					/>
				)}
			</div>
		);
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

interface ToolbarEditorProps extends Omit<EditorChooserProps, "onChange">,
                                     Omit<LangChooserProps, "onChange">,
                                     Pick<ElemPickerProps, "onSelectedField" | "onSelectedOptions"> {
	onEditorChange: EditorChooserProps["onChange"];
	onLangChange: LangChooserProps["onChange"];
	onSave: () => void;
	containerRef: React.RefObject<HTMLDivElement>;
	openJSONEditor: () => void;
	loading: number;
	saving?: boolean;
	edited?: boolean;
	onRemountLajiForm?: () => void;
}

const toolbarNmspc = nmspc("editor-toolbar");

const EditorToolbarSeparator = React.memo(function EditorToolbarSeparator() {
	return <span className={toolbarNmspc("separator")}></span>;
});

const EditorToolbar = ({
	active,
	onEditorChange,
	onLangChange,
	onSave,
	onSelectedField,
	onSelectedOptions,
	saving,
	loading,
	edited,
	containerRef,
	displaySchemaTabs,
	openJSONEditor,
	onRemountLajiForm
}: ToolbarEditorProps) => {
	const {translations} = React.useContext(Context);
	const {Glyphicon, ButtonGroup} = React.useContext(Context).theme;
	return (
		<div style={{display: "flex", width: "100%"}} className={toolbarNmspc()}>
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
				        disabled={!edited || saving}
				        onClick={onSave}>{translations.Save}</Button>
			</div>
		</div>
	);
};

interface EditorChooserProps { 
	active: ActiveEditorMode;
	onChange: (activeEditorMode: ActiveEditorMode) => void;
	displaySchemaTabs: boolean;
}

const editorNmspc = nmspc("editor-chooser");

type ActiveEditorMode = "uiSchema" | "basic" | "options";
const tabs = {options: "Editor.tab.options", basic: "Editor.tab.basic", uiSchema: "Editor.tab.uiSchema"};
const EditorChooser = React.memo(function EditorChooser(
	{active, onChange, displaySchemaTabs}
	: EditorChooserProps) {
	const _tabs = displaySchemaTabs ? tabs : {options: tabs.options};
	return (
		<div className={editorNmspc()} style={{display: "flex"}}>{
			Object.keys(_tabs).map((_active: ActiveEditorMode) =>
				<EditorChooserTab key={_active}
				                  active={active === _active}
				                  tab={_active}
				                  translationKey={tabs[_active]}
				                  onActivate={onChange} />
			)
		}</div>
	);
});

const EditorChooserTab = React.memo(function EditorChooserTab(
	{tab, translationKey, active, onActivate}
	: {
		tab: ActiveEditorMode,
		translationKey: string,
		active: boolean,
		onActivate: (active: ActiveEditorMode) => void
	}) {
	const translation = (React.useContext(Context).translations as any)[translationKey];
	return (
		<Clickable className={classNames(editorNmspc("button"), active && gnmspc("active"))}
		           onClick={React.useCallback(() => onActivate(tab), [tab, onActivate])} >
			{translation}
		</Clickable>
	);
});

interface ActiveEditorProps extends FieldEditorProps {
	active: ActiveEditorMode;
}
const ActiveEditor = React.memo(function ActiveEditor(
	{active, style, className, ...props}: ActiveEditorProps & Classable & Stylable) {
	return (
		<div style={style} className={className}>{
			active === "uiSchema" && <UiSchemaEditor {...props} />
			|| active === "basic" && <BasicEditor {...props} />
			|| null
		}</div>
	);
});

type FormJSONEditorProps = {
	master: MaybeError<Master>;
	onHide: () => void;
	onChange: EditorProps["onMasterChange"];
	onSave: EditorProps["onSave"];
}

const FormJSONEditorModal = React.memo(function FormJSONEditorModal(
	{master, onHide, onSave, onChange}: FormJSONEditorProps)
{
	// Focus on mount.
	const ref = React.useRef<HTMLTextAreaElement>(null);
	React.useEffect(() => ref.current?.focus(), []);

	const {translations} = React.useContext(Context);

	const [displaySaveModal, setShowSaveModal] = React.useState(false);
	const showSaveModal = React.useCallback(() => setShowSaveModal(true), [setShowSaveModal]);
	const hideSaveModal = React.useCallback(() => setShowSaveModal(false), [setShowSaveModal]);

	const [tmpValue, setTmpValue] = React.useState<Master>(isValid(master) ? master : {} as Master);

	const onSubmitDraft = React.useCallback((value: Master) => {
		onChange({type: "master", value});
		setTmpValue(value);
	}, [onChange, setTmpValue]);

	const onSaveChanges = React.useCallback(() => {
		onSave(tmpValue);
	}, [tmpValue, onSave]);

	const onHideCheckForChanges = React.useCallback(() => {
		tmpValue !== master
			&& confirm(translations["Editor.json.discard"])
			|| onSubmitDraft(tmpValue);
		onHide();
	}, [tmpValue, master, translations, onSubmitDraft, onHide]);

	return (
		<GenericModal onHide={onHideCheckForChanges}>
			<FormJSONEditor value={isValid(master) ? master : {}}
			                onSubmit={showSaveModal}
			                onSubmitDraft={onSubmitDraft}
			                onChange={setTmpValue} />
			{displaySaveModal && <SaveModal master={tmpValue}
					                            onSave={onSaveChanges}
			                                onHide={hideSaveModal} />}
		</GenericModal>
	);
});

const SaveModal = ({onSave, onHide, master}
	: {onSave: () => void, master: MaybeError<Master>} & Pick<GenericModalProps, "onHide">) => {
	const {translations} = React.useContext(Context);
	return (
		<GenericModal onHide={onHide} className={gnmspc("save-modal")} header={translations["Editor.save.header"]}>
			<div className={gnmspc("mb-5")}>{translations["Editor.save.description"]}</div>
			{isValid(master)
				? <DiffViewer master={master} />
				: <div className={gnmspc("error")}>{translations["Editor.saveModal.error.master"]}</div>
			}
			<Button onClick={onSave} variant="primary" disabled={!isValid(master)} >{translations.Save}</Button>
		</GenericModal>
	);
};

type GenericModalProps = {
	onHide: () => void;
	header?: string;
} & HasChildren & Classable

const GenericModal = ({onHide, children, header, className}: GenericModalProps) => {
	const {theme} = React.useContext(Context);
	const {Modal} = theme;
	return (
		<Modal show={true} onHide={onHide} dialogClassName={classNames(gnmspc(), gnmspc("wide-modal"), className)}>
			<Modal.Header closeButton={true}>
				{header}
			</Modal.Header>
			<Modal.Body>
				{ children }
			</Modal.Body>
		</Modal>
	);
};
