import * as React from "react";
import memoize from "memoizee";
import { DraggableHeight, DraggableWidth, Clickable, Button, Stylable, Classable, Spinner } from "./components";
import { classNames, nmspc, gnmspc, fieldPointerToSchemaPointer, fieldPointerToUiSchemaPointer, fetchJSON } from "./utils";
import { ChangeEvent, TranslationsChangeEvent, UiSchemaChangeEvent, FieldDeleteEvent, FieldAddEvent, Lang, Schemas } from "./LajiFormBuilder";
import { Context } from "./Context";
import * as LajiFormUtils from "laji-form/lib/utils";
const { parseJSONPointer, capitalizeFirstLetter } = LajiFormUtils;
import UiSchemaEditor from "./UiSchemaEditor";
import BasicEditor from "./BasicEditor";
import ApiClient from "./ApiClientImplementation";

export type FieldEditorChangeEvent =
	TranslationsChangeEvent
	| Omit<UiSchemaChangeEvent, "selected">
	| Omit<FieldDeleteEvent, "selected">
	| Omit<FieldAddEvent, "selected">;

export interface LajiFormEditorProps {
	master: any;
	schemas: Schemas;
	onChange: (changed: ChangeEvent[]) => void;
	onLangChange: (lang: Lang) => void;
	loading?: boolean;
}

export interface LajiFormEditorState {
	selected?: string;
	activeEditorMode: ActiveEditorMode;
}
export class LajiFormEditor extends React.PureComponent<LajiFormEditorProps & Stylable, LajiFormEditorState> {
	static contextType = Context;
	state = {selected: undefined, activeEditorMode: "basic" as ActiveEditorMode};
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
			overflowY: "scroll",
			overflowX: "auto",
			width: "100%"
		};
		const fieldsBlockStyle: React.CSSProperties = {
			display: "flex",
			flexDirection: "column",
			height: "100%"
		};
		return (
			<DraggableHeight style={containerStyle} fixed="bottom" height={400} className={gnmspc("editor")} thickness={2}>
				{this.props.loading
				? <Spinner color="black" size={100} />
				: (
					<React.Fragment>
						<DraggableWidth style={fieldsBlockStyle} className={gnmspc("editor-nav-bar")} thickness={2}>
							<LangChooser lang={this.context.lang} onChange={this.props.onLangChange} />
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
						</DraggableWidth>

						<div style={fieldEditorStyle}>
							<EditorChooser active={this.state.activeEditorMode} onChange={this.onActiveEditorChange} />
							{this.state.selected &&	(
								<Editor key={this.state.selected} active={this.state.activeEditorMode} {...this.getEditorProps()} className={gnmspc("field-editor")} />
							)}
						</div>
					</React.Fragment>
				)}
			</DraggableHeight>
		);
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

	getEditorProps(): FieldEditorProps {
		const { schemas, master } = this.props;
		const { lang, apiClient } = this.context;
		const selected = this.getSelected();
		const findField = (_field: FieldOptions, path: string): FieldOptions => {
			const [next, ...rest] = path.split("/").filter(s => s);
			if (next === undefined) {
				return _field;
			}
			const child  = (_field.fields as FieldOptions[]).find(_child => _child.name === next) as FieldOptions;
			return findField(child, rest.join("/"));
		};
		const documentField: FieldOptions = {
			name: "document",
			type: "fieldset",
			fields: this.props.master.fields
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

	onEditorChange = (events: ChangeEvent | ChangeEvent[]) => {
		events = (events instanceof Array ? events : [events]).map(event => {
			return { ...event, selected: this.getSelected() };
		});

		this.props.onChange(events);
	}

	onActiveEditorChange = (newActive: ActiveEditorMode) => {
		this.setState({activeEditorMode: newActive});
	}

	getSelected = () => this.getFieldPath(this.state.selected || "");

	getFieldPath = ((path: string) => path.replace("/document", ""));
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
			{fields.map((f: FieldProps) => <Field key={f.name} {...f} onSelected={onSelected} onDeleted={onDeleted} selected={selected} pointer={`${pointer}/${f.name}`} expanded={expanded} />)}
		</div>
	);
});

export interface FieldOptions {
	label?: string;
	name: string;
	options?: any;
	type?: string;
	validators?: any;
	fields?: FieldOptions[];
}
export interface FieldMap {
	label: string;
	name: string;
	options: any;
	type: string;
	validators: any;
	fields: {[field: string]: FieldMap};
}
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
}
class Field extends React.PureComponent<FieldProps, FieldState> {
	state = {
		expanded: this.props.expanded || this.isSelected() || false
	};

	static contextType = Context;

	nmspc = nmspc("field");

	isSelected(): boolean {
		return (this.props.selected || "") === this.props.pointer;
	}

	toggleExpand = () => {
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
		const className = fields.length
			? this.state.expanded
				? "expanded"
				: "contracted"
			: "nonexpandable";
		return (
			<div className={this.nmspc()}>
				<Clickable className={classNames(this.nmspc("item"), this.nmspc(this.isSelected() && "selected"))}>
					<Clickable key="expand" onClick={fields.length ? this.toggleExpand : undefined} className={this.nmspc(className)} />
					<Clickable className={this.nmspc("label")} onClick={this.onThisSelected}>{name}</Clickable>
					<Clickable onClick={this.onThisDeleted} className={this.nmspc("delete")} />
				</Clickable>
				{this.state.expanded && (
					<Fields
						key="fields"
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

const LangChooser = React.memo(function _LangChooser({lang, onChange}: {lang: Lang, onChange: (lang: Lang) => void}) {
	return (
	<div className="btn-group">{
		["fi", "sv", "en"].map((_lang: Lang) => (
			<Button
				className="btn-xs"
				active={_lang === lang}
				onClick={React.useCallback(() => onChange(_lang), [_lang])}
				key={_lang}
			>{_lang}
			</Button>
		))
	}</div>
	);
});

const editorNmspc = nmspc("editor-chooser");

type ActiveEditorMode = "uiSchema" | "basic";
const EditorChooser = React.memo(function _EditorChooser({active, onChange}: {active: ActiveEditorMode, onChange: (activeEditorMode: ActiveEditorMode) => void}) {
	return (
		<div className={editorNmspc()} style={{display: "flex"}}>{
			["basic", "uiSchema"].map((_active: ActiveEditorMode) => (
				<Clickable
					className={classNames(editorNmspc("button"), active === _active && gnmspc("active"))}
					onClick={React.useCallback(() => onChange(_active), [_active])}
					key={_active}
				>{capitalizeFirstLetter(_active)}
				</Clickable>
			))
		}</div>
	);
});

interface EditorProps extends FieldEditorProps {
	active: ActiveEditorMode;
}
const Editor = React.memo(function _Editor({active, style, className, ...props}: EditorProps & Classable & Stylable) {
	return (
		<div style={style} className={className}>{
			active === "uiSchema" && <UiSchemaEditor {...props} />
			|| active === "basic" && <BasicEditor {...props} />
			|| null
		}</div>
	);
});
