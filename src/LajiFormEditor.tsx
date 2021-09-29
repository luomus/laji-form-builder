import * as React from "react";
import memoize from "memoizee";
import { DraggableHeight, DraggableWidth, Clickable, Button, Stylable, Classable, Spinner } from "./components";
import { classNames, nmspc, gnmspc, fieldPointerToSchemaPointer, fieldPointerToUiSchemaPointer, parseJSONPointer } from "./utils";
import { ChangeEvent, TranslationsAddEvent, TranslationsChangeEvent, TranslationsDeleteEvent, UiSchemaChangeEvent, FieldDeleteEvent, FieldAddEvent, FieldUpdateEvent } from "./LajiFormBuilder";
import { Context } from "./Context";
import UiSchemaEditor from "./UiSchemaEditor";
import BasicEditor from "./BasicEditor";
import OptionsEditor from "./OptionsEditor";
import { Lang, Master, Schemas, Field as FieldOptions } from "./model";
import LajiForm from "laji-form/lib/components/LajiForm";
import { findNearestParentSchemaElem } from "laji-form/lib/utils";

export type FieldEditorChangeEvent =
	TranslationsAddEvent
	| TranslationsChangeEvent
	| TranslationsDeleteEvent
	| Omit<UiSchemaChangeEvent, "selected">
	| Omit<FieldDeleteEvent, "selected">
	| Omit<FieldAddEvent, "selected">
	| Omit<FieldUpdateEvent, "selected">;

export interface LajiFormEditorProps {
	master?: Master;
	schemas?: Schemas;
	onChange: (changed: ChangeEvent | ChangeEvent[]) => void;
	onLangChange: (lang: Lang) => void;
	height?: number;
	onHeightChange?: (height: number) => void;
	onSave: () => void;
	saving?: boolean;
}

export interface LajiFormEditorState {
	activeEditorMode: ActiveEditorMode;
	pointerChoosingActive: boolean;
	selected?: string;
	optionsEditorLoadedCallback?: () => void;
	optionsEditorFilter?: string[];
}

const withoutNameSpacePrefix = (str: string) => str.replace(/^[^./]+\./, "");

export class LajiFormEditor extends React.PureComponent<LajiFormEditorProps & Stylable, LajiFormEditorState> {
	static contextType = Context;
	state: LajiFormEditorState = {
		activeEditorMode: "basic" as ActiveEditorMode,
		pointerChoosingActive: false
	};
	containerRef = React.createRef<HTMLDivElement>();
	optionsEditorLajiFormRef = React.createRef<LajiForm>();
	optionsEditorRef = React.createRef<HTMLDivElement>();
	highlightedLajiFormElem?: HTMLElement;

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
				             thickness={2}
			                 onChange={this.onHeightChange} >
				{this.renderEditor()}
			</DraggableHeight>
		);
	}

	renderEditor() {
		const fieldEditorStyle: React.CSSProperties = {
			width: "100%"
		};
		const {master, schemas} = this.props;
		if (!master || !schemas) {
			return <Spinner size={100} />;
		}
		return (
			<div style={fieldEditorStyle}>
				<EditorToolbar active={this.state.activeEditorMode}
							   onEditorChange={this.onActiveEditorChange}
							   lang={this.context.lang}
							   onLangChange={this.props.onLangChange}
							   onSave={this.onSave} 
							   onSelectedField={this.onPickerSelectedField}
				               onSelectedOptions={this.onPickerSelectedOptions}
							   containerRef={this.containerRef}
						       saving={this.props.saving} />
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
		const {master, schemas} = this.props;
		const {activeEditorMode} = this.state;
		if (!master || !schemas) {
			return <Spinner size={100} />;
		}
		let content;
		if (activeEditorMode ===  "uiSchema" || activeEditorMode === "basic") {
			content =  (
				<React.Fragment>
					<DraggableWidth style={fieldsBlockStyle} className={gnmspc("editor-nav-bar")} thickness={2}>
						<Fields className={gnmspc("field-chooser")}
						        fields={this.getFields(master.fields)}
						        onSelected={this.onFieldSelected}
						        onDeleted={this.onFieldDeleted}
						        selected={this.state.selected}
						        pointer=""
						        expanded={true}
						/>
					</DraggableWidth>
					{this.state.selected && 
						<Editor key={this.state.selected}
						        active={this.state.activeEditorMode}
						        {...this.getFieldEditorProps(master, schemas)}
						        className={gnmspc("field-editor")}
						        style={fieldEditorContentStyle}
						/>
					}
				</React.Fragment>
			);
		} else if (activeEditorMode === "options") {
			content = <OptionsEditor master={master}
			                         translations={master.translations?.[this.context.lang as Lang] || {}}
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
				</div>
			) : null;
	}

	onSave = () => {
		this.props.onSave();
	}

	onHeightChange = ({height}: {height: number}) => {
		this.props.onHeightChange?.(height);
	}

	getFields = memoize((fields: any): any => ([{
		name: "document",
		label: "Document",
		type: "fieldset",
		fields
	}]));

	onFieldSelected = (field: string) => {
		this.setState({selected: field});
	}

	onFieldDeleted = (field: string) => {
		this.props.onChange([{type: "field", op: "delete", selected: this.getFieldPath(field)}]);
	}

	getFieldEditorProps(master: Master, schemas: Schemas): FieldEditorProps {
		const { lang } = this.context;
		const selected = this.getSelected();
		const findField = (_field: FieldOptions, path: string): FieldOptions => {
			const [next, ...rest] = path.split("/").filter(s => s);
			if (next === undefined) {
				return _field;
			}
			const child  = (_field.fields as FieldOptions[]).find(_child => withoutNameSpacePrefix(_child.name) === next) as FieldOptions;
			return findField(child, rest.join("/"));
		};
		return {
			schema: parseJSONPointer(schemas.schema, fieldPointerToSchemaPointer(schemas.schema, selected)),
			uiSchema: parseJSONPointer(master.uiSchema, fieldPointerToUiSchemaPointer(schemas.schema, selected), !!"safely"),
			field: findField(this.getFields(master.fields)[0], selected),
			translations: master.translations?.[lang as Lang] || {},
			path: selected,
			onChange: this.onEditorChange
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

	getFieldPath = ((path: string) => path === "/document" ? "" : path.replace("/document", ""));

	onPickerSelectedField = (selected: string) => {
		const state: Partial<LajiFormEditorState> = {selected};
		if (!["basic", "ui"].includes(this.state.activeEditorMode)) {
			state.activeEditorMode = "basic";
		}
		this.setState(state as LajiFormEditorState);
	}

	onPickerSelectedOptions = (selected: string[]) => {
		if (this.state.activeEditorMode === "options" && this.optionsEditorLajiFormRef.current) {
			this.setState({optionsEditorFilter: selected});
		} else {
			this.setState({activeEditorMode: "options", optionsEditorLoadedCallback: () => this.setState({optionsEditorFilter: selected, optionsEditorLoadedCallback: undefined})});
		}
	}

	clearOptionsEditorFilters = () => this.setState({optionsEditorFilter: undefined});
}

export interface FieldEditorProps extends Classable {
	uiSchema: any;
	schema: any;
	field: FieldOptions;
	translations: any;
	path: string;
	onChange: (changed: FieldEditorChangeEvent | FieldEditorChangeEvent[]) => void;
}

type OnSelectedCB = (field: string) => void;

const Fields = React.memo(function _Fields({fields = [], onSelected, onDeleted, selected, pointer, style = {}, className, expanded}
	: {fields: FieldProps[], onSelected: OnSelectedCB, onDeleted: OnSelectedCB, selected?: string, pointer: string, expanded?: boolean} & Stylable & Classable) {
	return (
		<div style={{...style, display: "flex", flexDirection: "column"}} className={className}>
			{fields.map((f: FieldProps) => <Field key={f.name} {...f} onSelected={onSelected} onDeleted={onDeleted} selected={selected} pointer={`${pointer}/${withoutNameSpacePrefix(f.name)}`} expanded={expanded} />)}
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
		if ((!Field.isSelected(prevProps.selected, prevProps.pointer) && Field.isSelected(this.props.selected, this.props.pointer))) {
			if (this.fieldRef.current) {
				// TODO doesn't work since container fixed?
				//scrollIntoViewIfNeeded(this.fieldRef.current);
			}
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
		const containerClassName = classNames(
			this.nmspc("item"),
			this.nmspc(Field.isSelected(this.props.selected, this.props.pointer) && "selected")
		);
		return (
			<div className={this.nmspc()} ref={this.fieldRef}>
				<Clickable
					className={containerClassName}
					onClick={this.onThisSelected}
				>
					<Clickable className={expandClassName} onClick={fields.length ? this.toggleExpand : undefined} key="expand" />
					<Clickable className={this.nmspc("label")}>{withoutNameSpacePrefix(name)}</Clickable>
					<Clickable className={this.nmspc("delete")} onClick={this.onThisDeleted} />
				</Clickable>
				{this.state.expanded && (
					<Fields
						fields={fields}
						onSelected={this.onChildSelected}
						onDeleted={this.onChildDeleted}
						selected={selected}
						pointer={pointer}
					/>
				)}
			</div>
		);
	}
}

interface LangChooserProps {
	lang: Lang;
	onChange: (lang: Lang) => void;
}

const LangChooser = React.memo(function LangChooser({lang, onChange}: LangChooserProps) {
	const {ButtonGroup} = React.useContext(Context).theme;
	return (
		<ButtonGroup small className={gnmspc("editor-lang-chooser")}>{
			["fi", "sv", "en"].map((_lang: Lang) => <LangChooserByLang key={_lang} onChange={onChange} lang={_lang} activeLang={lang} />)
		}</ButtonGroup>
	);
});

interface LangChooserByLangProps extends LangChooserProps {
	activeLang: Lang;
}

const LangChooserByLang = React.memo(function LangChooserByLang({lang, onChange, activeLang}: LangChooserByLangProps) {
	return (
		<Button active={lang === activeLang} onClick={React.useCallback(() => onChange(lang), [lang, onChange])}>
			{lang}
		</Button>
	);
});

interface ToolbarEditorProps extends Omit<EditorChooserProps, "onChange">, Omit<LangChooserProps, "onChange">, Pick<ElemPickerProps, "onSelectedField" | "onSelectedOptions"> {
	onEditorChange: EditorChooserProps["onChange"];
	onLangChange: LangChooserProps["onChange"];
	onSave: () => void;
	saving?: boolean;
	containerRef: React.RefObject<HTMLDivElement>
}

const toolbarNmspc = nmspc("editor-toolbar");

const EditorToolbarSeparator = React.memo(function EditorToolbarSeparator() { return <span className={toolbarNmspc("separator")}></span>; });

const EditorToolbar = ({active, onEditorChange, lang, onLangChange, onSave, onSelectedField, onSelectedOptions, saving, containerRef}: ToolbarEditorProps) => {
	const {translations} = React.useContext(Context);
	return (
		<div style={{display: "flex", width: "100%"}} className={toolbarNmspc()}>
			<LangChooser lang={lang} onChange={onLangChange} />
			<ElemPicker className={gnmspc("ml")} onSelectedField={onSelectedField} onSelectedOptions={onSelectedOptions} containerRef={containerRef} />
			<EditorToolbarSeparator />
			<EditorChooser active={active} onChange={onEditorChange} />
			<div style={{marginLeft: "auto"}}>
				<EditorToolbarSeparator />
				<Button small variant="success" disabled={saving} onClick={onSave}>{translations.Save}</Button>
			</div>
		</div>
	);
};

const parseOptionPaths = (elem: HTMLElement) => {
	const matches = elem.className.match(/laji-form-option-[^ ]+/g);
	return matches
		?  matches.map(s => s.replace("laji-form-option-", "").replace(/-/g, "/")) 
		: undefined;
};

const findOptionElem = (elem: HTMLElement) => {
	while (elem) {
		const match = elem.className?.match(/laji-form-option-/);
		if (match) {
			return elem;
		}
		elem = elem.parentNode as HTMLElement;
	}
	return undefined;
};

const usePrevious = <T extends unknown>(value: T): T | undefined => {
	  const ref = React.useRef<T>();
	  React.useEffect(() => {
		      ref.current = value;
		    });
	  return ref.current;
};
interface ElemPickerProps extends Classable {
	onSelectedField: (selected: string) => void;
	onSelectedOptions: (selected: string[]) => void;
	containerRef: React.RefObject<HTMLDivElement>;
}
const ElemPicker = React.memo(function ElemPicker({onSelectedField, onSelectedOptions, className, containerRef}: ElemPickerProps) {
	const [isActive, setActive] = React.useState(false);
	const [highlightedLajiFormElem, setHighlightedLajiFormElem] = React.useState<HTMLElement>();
	const [highlightedOptionElem, setHighlightedOptionElem] = React.useState<HTMLElement>();
	const [highlightedElem, setHighlightedElem] = React.useState<HTMLElement>();
	const prevHighlightedElem = usePrevious(highlightedElem);
	const onMouseMove = React.useCallback(({clientX, clientY}: MouseEvent) => {
		const elem = document.elementFromPoint(clientX, clientY) as HTMLElement;
		const lajiFormElem = findNearestParentSchemaElem(elem);
		if (lajiFormElem && !containerRef.current?.contains(lajiFormElem)) {
			setHighlightedLajiFormElem(lajiFormElem);
		} else {
			setHighlightedLajiFormElem(undefined);
		}

		const optionElem = elem && findOptionElem(elem);
		if (optionElem) {
			setHighlightedOptionElem(optionElem);
		} else {
			setHighlightedOptionElem(undefined);
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

	const onClick = React.useCallback(() => {
		if (highlightedLajiFormElem) {
			const id = highlightedLajiFormElem?.id
				.replace(/_laji-form_[0-9]+_root|_[0-9]/g, "")
				.replace(/_/g, "/");
			if (!id) {
				return;
			}
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
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("click", onClick);
			document.addEventListener("keydown", onKeyDown);
			return () => {
				document.removeEventListener("mousemove", onMouseMove);
				document.removeEventListener("click", onClick);
				document.removeEventListener("keydown", onKeyDown);
			};
		} else {
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("click", onClick);
			document.removeEventListener("keydown", onKeyDown);
			return undefined;
		}
	}, [isActive, onClick, onKeyDown, onMouseMove]);
	React.useEffect(() => {
		if (highlightedElem) {
			highlightedElem.className = `${highlightedElem.className} ${gnmspc("form-highlight")}`;
		}
		if (prevHighlightedElem) {
			prevHighlightedElem.className = prevHighlightedElem.className.replace(` ${gnmspc("form-highlight")}`, "");
		}
	}, [highlightedElem, prevHighlightedElem]);
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
		<Button active={isActive} onClick={isActive ? stop : start} small className={className}>
			<Glyphicon glyph="magnet" className={classNames(isActive && "active")} />
		</Button>
	);
});

interface EditorChooserProps { 
	active: ActiveEditorMode;
	onChange: (activeEditorMode: ActiveEditorMode) => void;
}

const editorNmspc = nmspc("editor-chooser");

type ActiveEditorMode = "uiSchema" | "basic" | "options";
const tabs = {options: "Editor.tab.options", basic: "Editor.tab.basic", uiSchema: "Editor.tab.uiSchema"};
const EditorChooser = React.memo(function EditorChooser(
	{active, onChange}
	: EditorChooserProps) {
	return (
		<div className={editorNmspc()} style={{display: "flex"}}>{
			Object.keys(tabs).map((_active: ActiveEditorMode) => <EditorChooserTab key={_active} active={active === _active} tab={_active} translationKey={tabs[_active]}  onActivate={onChange} />)
		}</div>
	);
});

const EditorChooserTab = React.memo(function EditorChooserTab(
	{tab, translationKey, active, onActivate}
	: {tab: ActiveEditorMode, translationKey: string, active: boolean, onActivate: (active: ActiveEditorMode) => void}) {
	const translation = (React.useContext(Context).translations as any)[translationKey];
	return (
		<Clickable className={classNames(editorNmspc("button"), active && gnmspc("active"))}
		           onClick={React.useCallback(() => onActivate(tab), [tab, onActivate])} >
			{translation}
		</Clickable>
	);
});

interface EditorProps extends FieldEditorProps {
	active: ActiveEditorMode;
}
const Editor = React.memo(function Editor({active, style, className, ...props}: EditorProps & Classable & Stylable) {
	return (
		<div style={style} className={className}>{
			active === "uiSchema" && <UiSchemaEditor {...props} />
			|| active === "basic" && <BasicEditor {...props} />
			|| null
		}</div>
	);
});

