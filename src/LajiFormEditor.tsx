import * as React from "react";
import memoize from "memoizee";
import { DraggableHeight, DraggableWidth, Clickable, Button, Stylable, Classable, Spinner } from "./components";
import { classNames, nmspc, gnmspc, fieldPointerToSchemaPointer, fieldPointerToUiSchemaPointer, parseJSONPointer } from "./utils";
import { ChangeEvent, TranslationsAddEvent, TranslationsChangeEvent, TranslationsDeleteEvent, UiSchemaChangeEvent, FieldDeleteEvent, FieldAddEvent, FieldUpdateEvent, Lang, Schemas, FieldOptions } from "./LajiFormBuilder";
import { Context } from "./Context";
import * as LajiFormUtils from "laji-form/lib/utils";
const { findNearestParentSchemaElem } = LajiFormUtils;
import UiSchemaEditor from "./UiSchemaEditor";
import BasicEditor from "./BasicEditor";
import OptionsEditor from "./OptionsEditor";

export type FieldEditorChangeEvent =
	TranslationsAddEvent
	| TranslationsChangeEvent
	| TranslationsDeleteEvent
	| Omit<UiSchemaChangeEvent, "selected">
	| Omit<FieldDeleteEvent, "selected">
	| Omit<FieldAddEvent, "selected">
	| Omit<FieldUpdateEvent, "selected">;

export interface LajiFormEditorProps {
	master: any;
	schemas: Schemas;
	onChange: (changed: ChangeEvent | ChangeEvent[]) => void;
	onLangChange: (lang: Lang) => void;
	loading?: boolean;
	height?: number;
	onHeightChange?: (height: number) => void;
	onSave: () => void;
}

export interface LajiFormEditorState {
	selected?: string;
	activeEditorMode: ActiveEditorMode;
	pointerChoosingActive: boolean;
	formOptionsModalOpen: boolean;
}

const withoutNameSpacePrefix = (str: string) => str.replace(/^[^./]+\./, "");

export class LajiFormEditor extends React.PureComponent<LajiFormEditorProps & Stylable, LajiFormEditorState> {
	static contextType = Context;
	state = {selected: undefined, activeEditorMode: "basic" as ActiveEditorMode, pointerChoosingActive: false, formOptionsModalOpen: false};
	highlightedLajiFormElem?: HTMLElement;

	render() {
		const containerStyle: React.CSSProperties = {
			display: "flex",
			flexDirection: "row",
			width: "100%"
		};
		const fieldsStyle: React.CSSProperties = {
			overflowY: "auto",
			display: "flex",
			flexDirection: "column",
			overflowX: "auto",
			height: "100%"
		};
		const fieldEditorStyle: React.CSSProperties = {
			width: "100%"
		};
		const fieldEditorContentStyle: React.CSSProperties = {
			overflow: "auto",
			height: "100%"
		};
		const fieldsBlockStyle: React.CSSProperties = {
			display: "flex",
			flexDirection: "column",
			height: "100%"
		};
		const sidebarToolbarContainer: React.CSSProperties = {
			display: "flex",
			flexDirection: "row",
		};
		const {Glyphicon} = this.context.theme;
		const {translations} = this.context;
		return (
			<React.Fragment>
				<DraggableHeight
					style={containerStyle}
					fixed="bottom"
					height={this.props.height}
					className={gnmspc("editor")}
					thickness={2}
					onChange={this.onHeightChange}
				>
					{this.props.loading
						? <Spinner size={100} />
						: (
							<React.Fragment>
								<DraggableWidth style={fieldsBlockStyle} className={gnmspc("editor-nav-bar")} thickness={2}>
									<div style={sidebarToolbarContainer}>
										<LangChooser lang={this.context.lang} onChange={this.props.onLangChange} />
										<Clickable className="glyph-container"
										           onClick={this.state.pointerChoosingActive ? this.pointerChoosing.stop : this.pointerChoosing.start}>
											<Glyphicon glyph="magnet" className={classNames(this.state.pointerChoosingActive && "active")} />
										</Clickable>
										<Clickable className="glyph-container" onClick={this.openFormOptionsEditor}>
											<Glyphicon glyph="cog" />
										</Clickable>
									</div>
									<Fields
										style={fieldsStyle}
										className={gnmspc("field-chooser")}
										fields={this.getFields(this.props.master.fields)}
										onSelected={this.onFieldSelected}
										onDeleted={this.onFieldDeleted}
										selected={this.state.selected}
										pointer=""
										expanded={true}
									/>
									<Button small variant="success" onClick={this.onSave}>{translations.Save}</Button>
								</DraggableWidth>
								<div style={fieldEditorStyle}>
									<EditorChooser active={this.state.activeEditorMode} onChange={this.onActiveEditorChange} />
									{this.state.selected &&	(
										<Editor
											key={this.state.selected}
											active={this.state.activeEditorMode}
											{...this.getFieldEditorProps()}
											className={gnmspc("field-editor")}
											style={fieldEditorContentStyle}
										/>
									)}
								</div>
								{this.state.formOptionsModalOpen &&
									<OptionsEditor
										onClose={this.closeFormOptionsEditor}
										master={this.props.master}
										translations={this.props.master.translations[this.context.lang]}
										onChange={this.props.onChange}
									/>
								}
							</React.Fragment>
						)}
				</DraggableHeight>
			</React.Fragment>
		);
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

	getFieldEditorProps(): FieldEditorProps {
		const { schemas, master } = this.props;
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
			field: findField(this.getFields(this.props.master.fields)[0], selected),
			translations: master.translations[lang],
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

	pointerChoosing = {
		start: () => {
			this.setState({pointerChoosingActive: true}, () => {
				document.addEventListener("mousemove", this.pointerChoosing.onMouseMove);
				document.addEventListener("click", this.pointerChoosing.onClick);
				document.addEventListener("keydown", this.pointerChoosing.onKeyDown);
			});
		},
		stop: () => {
			this.setState({pointerChoosingActive: false}, () => {
				document.removeEventListener("mousemove", this.pointerChoosing.onMouseMove);
				document.removeEventListener("click", this.pointerChoosing.onClick);
				document.removeEventListener("keydown", this.pointerChoosing.onKeyDown);
				this.pointerChoosing.rmHighlight(this.highlightedLajiFormElem);
				this.highlightedLajiFormElem = undefined;
			});
		},
		rmHighlight: (elem?: HTMLElement) => {
			if (elem) {
				elem.className = elem.className.replace(` ${gnmspc("form-highlight")}`, "");
			}
		},
		onMouseMove: ({clientX, clientY}: MouseEvent) => {
			const lajiFormElem = findNearestParentSchemaElem(document.elementFromPoint(clientX, clientY));
			if (lajiFormElem) {
				this.pointerChoosing.rmHighlight(this.highlightedLajiFormElem);
				this.highlightedLajiFormElem = lajiFormElem;
				this.highlightedLajiFormElem.className = `${this.highlightedLajiFormElem.className} ${gnmspc("form-highlight")}`;
			}
		},
		onClick: () => {
			const id = this.highlightedLajiFormElem?.id
				.replace(/_laji-form_[0-9]+_root|_[0-9]/g, "")
				.replace(/_/g, "/");
			if (!id) {
				return;
			}
			this.setState({pointerChoosingActive: false}, () => {
				this.pointerChoosing.stop();
				this.setState({selected: `/document${id}`});
			});
		},
		onKeyDown: (e: KeyboardEvent) => {
			e.key === "Escape" && this.pointerChoosing.stop();
		}
	}

	openFormOptionsEditor = () => {
		this.setState({formOptionsModalOpen: true});
	}
	closeFormOptionsEditor = () => {
		this.setState({formOptionsModalOpen: false});
	}
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
		<ButtonGroup small>{
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

const editorNmspc = nmspc("editor-chooser");

type ActiveEditorMode = "uiSchema" | "basic";
const tabs = {basic: "Basic", uiSchema: "Editor.tab.uiSchema"};
const EditorChooser = React.memo(function EditorChooser(
	{active, onChange}
	: {active: ActiveEditorMode, onChange: (activeEditorMode: ActiveEditorMode) => void}) {
	return (
		<div className={editorNmspc()} style={{display: "flex"}}>{
			Object.keys(tabs).map((_active: ActiveEditorMode) => <EditorChooserTab  key={_active} active={active === _active} tab={_active} translationKey={tabs[_active]}  onActivate={onChange} />)
		}</div>
	);
});

const EditorChooserTab = React.memo(function EditorChooserTab(
	{tab, translationKey, active, onActivate}
	: {tab: ActiveEditorMode, translationKey: string, active: boolean, onActivate: (active: ActiveEditorMode) => void}) {
	const translation = (React.useContext(Context).translations as any)[translationKey];
	return (
		<Clickable
			className={classNames(editorNmspc("button"), active && gnmspc("active"))}
			onClick={React.useCallback(() => onActivate(tab), [tab, onActivate])}
		>{translation}
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
