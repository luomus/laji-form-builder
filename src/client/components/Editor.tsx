import * as React from "react";
import { createPortal } from "react-dom";
import memoize from "memoizee";
import { 
	DraggableHeight, DraggableWidth, Clickable, Button, Stylable, Classable, Spinner, FormJSONEditor, HasChildren
} from "./components";
import { classNames, nmspc, gnmspc, fieldPointerToSchemaPointer, fieldPointerToUiSchemaPointer, scrollIntoViewIfNeeded,
	makeCancellable } from "../utils";
import { getPropertyContextName, parseJSONPointer, unprefixProp } from "../../utils";
import { ChangeEvent, TranslationsAddEvent, TranslationsChangeEvent, TranslationsDeleteEvent, UiSchemaChangeEvent,
	FieldDeleteEvent, FieldAddEvent, FieldUpdateEvent, MaybeError, isValid } from "./Builder";
import { Context } from "./Context";
import UiSchemaEditor from "./UiSchemaEditor";
import BasicEditor from "./BasicEditor";
import OptionsEditor from "./OptionsEditor";
import { Lang, Master, SchemaFormat, Field as FieldOptions } from "../../model";
import LajiForm from "laji-form/lib/components/LajiForm";
import { findNearestParentSchemaElem, translate as translateKey } from "laji-form/lib/utils";
import diff, { Diff, DiffDeleted, DiffEdit, DiffNew } from "deep-diff";

export type FieldEditorChangeEvent =
	TranslationsAddEvent
	| TranslationsChangeEvent
	| TranslationsDeleteEvent
	| Omit<UiSchemaChangeEvent, "selected">
	| Omit<FieldDeleteEvent, "selected">
	| Omit<FieldAddEvent, "selected">
	| Omit<FieldUpdateEvent, "selected">;

export interface EditorProps extends Stylable, Classable {
	master?: Master;
	schemaFormat?: MaybeError<SchemaFormat>;
	onChange: (changed: ChangeEvent | ChangeEvent[]) => void;
	onLangChange: (lang: Lang) => void;
	height?: number;
	onHeightChange?: (height: number) => void;
	onSave: (master: Master) => void;
	onSaveFromState: () => void;
	saving?: boolean;
	loading?: boolean;
	edited?: boolean;
	displaySchemaTabs: boolean;
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
	diffViewerOpen?: boolean;
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
				{master.baseFormID && (
					<div className={gnmspc("warning")}>
						{translateKey(translations, "Editor.warning.baseFormID", {baseFormID: master.baseFormID})}
					</div>
				)}
				{errorMsg && <div className={gnmspc("error")}>{translations[errorMsg] || errorMsg}</div>}
				{master.patch && <div className={gnmspc("warning")}>{translations["Editor.warning.patch"]}</div>}
				<EditorToolbar active={this.state.activeEditorMode}
				               onEditorChange={this.onActiveEditorChange}
				               onLangChange={this.props.onLangChange}
				               onSave={this.props.onSaveFromState} 
				               onSelectedField={this.onPickerSelectedField}
				               onSelectedOptions={this.onPickerSelectedOptions}
				               containerRef={this.containerRef}
				               saving={this.props.saving}
				               loading={this.props.loading}
				               edited={this.props.edited}
				               openJSONEditor={this.openJSONEditor}
				               openDiffViewer={this.openDiffViewer}
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
		const {master, schemaFormat} = this.props;
		const {activeEditorMode} = this.state;
		if (!master || !schemaFormat) {
			return <Spinner size={100} />;
		}
		let content;
		if (activeEditorMode ===  "uiSchema" || activeEditorMode === "basic") {
			content =  (
				<ActiveEditorErrorBoundary>
					<DraggableWidth style={fieldsBlockStyle} className={gnmspc("editor-nav-bar")} ref={this.fieldsRef}>
						<Fields className={gnmspc("field-chooser")}
						        fields={this.getFields(master)}
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
						              {...this.getFieldEditorProps(master, schemaFormat)}
						              className={gnmspc("field-editor")}
						              style={fieldEditorContentStyle}
						/>
					}
				</ActiveEditorErrorBoundary>
			);
		} else if (activeEditorMode === "options") {
			content = <OptionsEditor master={master}
			                         translations={master.translations?.[this.context.editorLang as Lang] || {}}
			                         className={classNames(gnmspc("field-editor"), gnmspc("options-editor"))}
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
					{this.state.jsonEditorOpen && <FormJSONEditorModal master={master}
					                                                   onHide={this.hideJSONEditor}
					                                                   onSave={this.props.onSave}
					                                                   onChange={this.props.onChange} />}
					{this.state.diffViewerOpen && <DiffViewerModal master={master}
					                                               onHide={this.hideDiffViewer} />}
				</div>
			) : null;
	}

	onHeightChange = ({height}: {height: number}) => {
		this.props.onHeightChange?.(height);
	}

	getFields = memoize((master: Master): any => ([{
		name: unprefixProp(getPropertyContextName(master.context)),
		fields: master.fields
	}]));

	onFieldSelected = (field: string) => {
		this.setState({selected: field});
	}

	onFieldDeleted = (field: string) => {
		this.props.onChange([{type: "field", op: "delete", selected: this.getFieldPath(field)}]);
	}

	getFieldEditorProps(master: Master, schemaFormat: SchemaFormat): FieldEditorProps {
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
				master.uiSchema,
				fieldPointerToUiSchemaPointer(schemaFormat.schema, selected),
				!!"safely"
			),
			field: findField(this.getFields(master)[0], selected),
			translations: master.translations?.[editorLang as Lang] || {},
			path: selected,
			onChange: this.onEditorChange,
			context: master.context
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

	openDiffViewer = () => {
		this.setState({diffViewerOpen: true});
	}

	hideDiffViewer = () => {
		this.setState({diffViewerOpen: false});
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
	saving?: boolean;
	loading?: boolean;
	edited?: boolean;
	containerRef: React.RefObject<HTMLDivElement>;
	openJSONEditor: () => void;
	openDiffViewer: () => void;
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
	openDiffViewer,
	onRemountLajiForm
}: ToolbarEditorProps) => {
	const {translations} = React.useContext(Context);
	const {Glyphicon, ButtonGroup} = React.useContext(Context).theme;
	return (
		<div style={{display: "flex", width: "100%"}} className={toolbarNmspc()}>
			<LangChooser onChange={onLangChange} />
			<ButtonGroup>
				<ElemPicker className={classNames(gnmspc("elem-picker"), gnmspc("ml"))}
				            onSelectedField={onSelectedField}
				            onSelectedOptions={onSelectedOptions}
				            containerRef={containerRef} />
				{onRemountLajiForm && (
					<Button onClick={onRemountLajiForm} small>
						<Glyphicon glyph="refresh"  />
					</Button>
				) }
				<Button onClick={openJSONEditor} small>JSON</Button>
				<Button onClick={openDiffViewer} small disabled={!edited}>diff</Button>
			</ButtonGroup>
			<EditorToolbarSeparator />
			<EditorChooser active={active} onChange={onEditorChange} displaySchemaTabs={displaySchemaTabs} />
			<div style={{marginLeft: "auto", display: "flex"}}>
				{ loading && <Spinner className={toolbarNmspc("loader")} size={20} style={{left: 0}}/> }
				<EditorToolbarSeparator />
				<Button small
				        variant="success"
				        disabled={!edited || saving}
				        onClick={onSave}>{translations.Save}</Button>
			</div>
		</div>
	);
};

const parseOptionPaths = (elem: Element) => {
	const matches = elem.className.match(/laji-form-option-[^ ]+/g);
	return matches
		?  matches.map(s => s.replace("laji-form-option-", "").replace(/-/g, "/")) 
		: undefined;
};

const findOptionElem = (elem: Element) => {
	while (elem) {
		const match = (typeof elem.className === "string") && elem.className.match(/laji-form-option-/);
		if (match) {
			return elem;
		}
		elem = elem.parentNode as HTMLElement;
	}
	return undefined;
};

interface ElemPickerProps extends Classable {
	onSelectedField: (selected: string) => void;
	onSelectedOptions: (selected: string[]) => void;
	containerRef: React.RefObject<HTMLDivElement>;
}
const ElemPicker = React.memo(function ElemPicker({
	onSelectedField,
	onSelectedOptions,
	className,
	containerRef
}: ElemPickerProps) {
	const [isActive, setActive] = React.useState(false);
	const [highlightedLajiFormElem, setHighlightedLajiFormElem] = React.useState<Element>();
	const [highlightedOptionElem, setHighlightedOptionElem] = React.useState<Element>();
	const [highlightedElem, setHighlightedElem] = React.useState<Element>();
	const onElemHighlighted = React.useCallback((elem: Element) => {
		const lajiFormElem = findNearestParentSchemaElem(elem as HTMLElement);
		const optionElem = elem && findOptionElem(elem);
		if (lajiFormElem && !containerRef.current?.contains(lajiFormElem)) {
			setHighlightedLajiFormElem(lajiFormElem);
		} else if (optionElem) {
			setHighlightedOptionElem(optionElem);
		} else {
			setHighlightedLajiFormElem(undefined);
		}
	}, [containerRef]);

	React.useEffect(() => {
		if (highlightedLajiFormElem) {
			setHighlightedElem(highlightedLajiFormElem);
		} else if (highlightedOptionElem) {
			setHighlightedElem(highlightedOptionElem);
		} else if (highlightedElem !== undefined) {
			setHighlightedElem(undefined);
		}
	}, [highlightedElem, highlightedLajiFormElem, highlightedOptionElem]);

	const onClick = React.useCallback((e) => {
		if (highlightedLajiFormElem) {
			const id = highlightedLajiFormElem?.id
				.replace(/_laji-form_[0-9]+_root|_[0-9]/g, "")
				.replace(/_/g, "/");
			if (!id) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			onSelectedField(`/document${id}`);
			setActive(false);
		} else if (highlightedOptionElem) {
			const optionPaths = parseOptionPaths(highlightedOptionElem);
			if (optionPaths) {
				onSelectedOptions(optionPaths);
				setActive(false);
			}
		}
	}, [setActive, highlightedLajiFormElem, highlightedOptionElem, onSelectedOptions, onSelectedField]);
	const onKeyDown = React.useCallback((e: KeyboardEvent) => {
		e.key === "Escape" && setActive(false);
	}, [setActive]);
	React.useEffect(() => {
		if (isActive) {
			document.addEventListener("click", onClick);
			document.addEventListener("keydown", onKeyDown);
			return () => {
				document.removeEventListener("click", onClick);
				document.removeEventListener("keydown", onKeyDown);
			};
		} else {
			document.removeEventListener("click", onClick);
			document.removeEventListener("keydown", onKeyDown);
			return undefined;
		}
	}, [isActive, onClick, onKeyDown]);
	React.useEffect(() => {
		if (!isActive) {
			setHighlightedLajiFormElem(undefined);
			setHighlightedOptionElem(undefined);
		}
	}, [isActive]);
	const start = React.useCallback(() => setActive(true), [setActive]);
	const stop = React.useCallback(() => setActive(false), [setActive]);
	const {Button, Glyphicon} = React.useContext(Context).theme;
	return (
		<React.Fragment>
			<Button active={isActive} onClick={isActive ? stop : start} small className={className}>
				<Glyphicon glyph="magnet" className={classNames(isActive && "active")} />
			</Button>
			<Highlighter highlightedElem={highlightedElem} active={isActive} onElemHighlighted={onElemHighlighted} />
		</React.Fragment>
	);
});

const Highlighter = ({highlightedElem, active, onElemHighlighted}
	: {highlightedElem?: Element, active?: boolean, onElemHighlighted: (e: Element) => void}) => {
	const ref = React.useRef<HTMLDivElement>(null);
	const highlighter = ref.current;
	const onMouseMove = React.useCallback(({clientX, clientY}: MouseEvent) => {
		const elems = document.elementsFromPoint(clientX, clientY);
		onElemHighlighted(highlighter && elems[0] === highlighter ? elems[1] : elems[0]);
	}, [highlighter, onElemHighlighted]);

	React.useEffect(() => {
		if (active) {
			document.addEventListener("mousemove", onMouseMove);
			return () => {
				document.removeEventListener("mousemove", onMouseMove);
			};
		} else {
			document.removeEventListener("mousemove", onMouseMove);
			return undefined;
		}
	}, [active, onMouseMove]);

	const {top, width, left, height} = highlightedElem?.getBoundingClientRect() || {};
	const scrolled = window.pageYOffset;
	React.useEffect(() => {
		if (!highlighter) {
			return;
		}
		if (!highlightedElem) {
			highlighter.style.display = "none";
			return;
		}
		highlighter.style.display = "block";
		if (typeof top === "number") {
			highlighter.style.top = top + scrolled + "px";
		}
		if (typeof left === "number") {
			highlighter.style.left = left + "px";
		}
		if (typeof width === "number") {
			highlighter.style.width = width + "px";
		}
		if (typeof height === "number") {
			highlighter.style.height = height + "px";
		}
	}, [highlighter, highlightedElem, top, width, left, height, scrolled]);
	return createPortal(
		<div ref={ref}
		     className={gnmspc("picker-highlighter")}
		     style={{position: "absolute", zIndex: 1039}} />,
		document.body
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
	master: Master;
	onHide: () => void;
	onChange: EditorProps["onChange"];
	onSave: EditorProps["onSave"];
}

const FormJSONEditorModal = React.memo(function FormJSONEditorModal(
	{master, onHide, onSave, onChange}: FormJSONEditorProps)
{
	const {translations} = React.useContext(Context);

	// Focus on mount.
	const ref = React.useRef<HTMLTextAreaElement>(null);
	React.useEffect(() => ref.current?.focus(), []);

	const [tmpValue, setTmpValue] = React.useState<Master | undefined>(undefined);

	const onSubmitDraft = React.useCallback((value: Master) => {
		onChange({type: "master", value});
		setTmpValue(undefined);
	}, [onChange, setTmpValue]);

	const onSubmit = React.useCallback((value: Master) => {
		onSave(value);
		setTmpValue(undefined);
	}, [onSave, setTmpValue]);

	const onHideCheckForChanges = React.useCallback(() => {
		tmpValue
			&& confirm(translations["editor.json.confirmApply"])
			&& onSubmit(tmpValue);
		onHide();
	}, [tmpValue, translations, onSubmit, onHide]);

	return (
		<GenericModal onHide={onHideCheckForChanges}>
			<FormJSONEditor value={master}
			                onSubmit={onSubmit}
			                onSubmitDraft={onSubmitDraft}
			                onChange={setTmpValue} />
		</GenericModal>
	);
});

type DiffViewerProps = {
	master: Master;
	onHide: () => void;
}

type NonArrayDiff = DiffNew<unknown> | DiffEdit<unknown> | DiffDeleted<unknown>;

const getDiff = memoize((obj1: unknown, obj2: unknown) => {
	const flattenArrays = (diffs: Diff<unknown>[]): NonArrayDiff[] => {
		return diffs.reduce((_diffs, d) => {
			if (d.kind === "A") {
				_diffs.push({...d.item, path: [...(d.path || []), d.index]} as NonArrayDiff);
			} else {
				_diffs.push(d);
			}
			return _diffs;
		}, [] as NonArrayDiff[]);
	};
	const diffs =	diff(obj1, obj2);
	return diffs ? flattenArrays(diffs) : [];
});

const DiffViewerModal = React.memo(function DiffViewerModal({master, onHide}: DiffViewerProps) {
	const {formService} = React.useContext(Context);
	const [remoteMaster, setRemoteMaster] = React.useState<Master | undefined>(undefined);
	React.useEffect(() => {
		if (!master.id) {
			return;
		}
		const promise = makeCancellable(formService.getMaster(master.id).then(setRemoteMaster));
		return promise.cancel;
	}, [formService, master.id]);
	return (
		<GenericModal onHide={onHide}>
			<DiffsViewer diffs={getDiff(remoteMaster, master)} />
		</GenericModal>
	);
});

const DiffPath = ({path}: Diff<unknown>) => <span>{path?.join(".")}</span>;

const DiffKindMapper = (diff: Diff<unknown>) => {
	switch (diff.kind) {
	case "N":
		return <DiffNewViewer {...diff} />;
	case "D":
		return <DiffDeletedViewer {...diff} />;
	case "E":
		return <DiffEditViewer {...diff} />;
	default:
		 return null;
	}
};

const DiffNewViewer = (diff: DiffNew<unknown>) => {
	return <span>{JSON.stringify(diff.rhs)}</span>;
};

const DiffDeletedViewer = (diff: DiffDeleted<unknown>) => {
	return <span>{JSON.stringify(diff.lhs)}</span>;
};

const DiffEditViewer = (diff: DiffEdit<unknown>) => {
	return <span>{`${JSON.stringify(diff.lhs)} ➞ ${JSON.stringify(diff.rhs)}`}</span>;
};

const diffNmspc = nmspc("diff");

const mapDiffClassName = (kind: Diff<unknown>["kind"]) => {
	switch (kind) {
	case "N":
		return diffNmspc("new");
	case "D":
		return diffNmspc("delete");
	case "E":
		return diffNmspc("edit");
	default:
		 return "";
	}
};

const DiffViewerRow = (diff: Diff<unknown>) => (
	<tr className={mapDiffClassName(diff.kind)}>
		<th><DiffPath {...diff} /></th>
		<td>
			<DiffKindMapper {...diff} />
		</td>
	</tr>
);

const DiffsViewer = ({diffs}: {diffs: Diff<unknown>[]}) => {
	const {theme} = React.useContext(Context);
	const {Table} = theme;
	return (
		<Table bordered condensed>
			<tbody>
				{diffs.map(d => <DiffViewerRow key={d.path?.join() + d.kind} {...d}/>)}
			</tbody>
		</Table>
	);
};

const GenericModal = ({onHide, children}: {onHide: () => void} & HasChildren) => {
	const {theme} = React.useContext(Context);
	const {Modal} = theme;
	return (
		<Modal show={true} onHide={onHide} dialogClassName={classNames(gnmspc(), gnmspc("wide-modal"))}>
			<Modal.Header closeButton={true}>
			</Modal.Header>
			<Modal.Body>
				{ children }
			</Modal.Body>
		</Modal>
	);
};
