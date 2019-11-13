import * as React from "react";
import { DraggableHeight, DraggableWidth, Clickable, Button, Stylable, Classable } from "./components";
import { classNames, nmspc, gnmspc, fieldPointerToSchemaPointer, fieldPointerToUiSchemaPointer } from "./utils";
import { ChangeEvent, TranslationsChangeEvent, UiSchemaChangeEvent, Lang, Schemas } from "./LajiFormBuilder";
import * as LajiFormUtils from "laji-form/lib/utils";
const { parseJSONPointer } = LajiFormUtils;
import UiSchemaEditor from "./UiSchemaEditor";

export type FieldEditorChangeEvent = Omit<UiSchemaChangeEvent, "selected"> | TranslationsChangeEvent;

export interface LajiFormEditorProps {
	master: any;
	schemas: Schemas;
	onChange: (changed: ChangeEvent[]) => void;
	lang: Lang;
	json: {
		fields: FieldProps[];
	};
	onLangChange: (lang: Lang) => void;
}

export interface FieldMap {
	[field: string]: FieldMap;
}
export interface LajiFormEditorState {
	selected?: string;
	activeEditorMode: ActiveEditorMode;
}
export class LajiFormEditor extends React.PureComponent<LajiFormEditorProps & Stylable, LajiFormEditorState> {
	state = {selected: undefined, activeEditorMode: "basic" as ActiveEditorMode};
	render() {
		const containerStyle: React.CSSProperties = {
			display: "flex",
			flexDirection: "row",
			width: "100%"
		};
		const fieldsStyle: React.CSSProperties = {
			overflowY: "scroll",
			display: "flex",
			flexDirection: "column",
			paddingLeft: "20px",
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
			<DraggableHeight style={containerStyle} fixed="bottom" height={400} className={gnmspc("editor")}>
				<DraggableWidth style={fieldsBlockStyle} className={gnmspc("editor-nav-bar")}>
					<LangChooser lang={this.props.lang} onChange={this.props.onLangChange} />
					<Fields
						style={fieldsStyle}
						className={gnmspc("field-chooser")}
						fields={this.props.json.fields}
						onSelected={this.onFieldSelected}
						selected={this.state.selected}
						pointer=""
					/>
				</DraggableWidth>
			{this.state.selected &&	(
					<div className={gnmspc("field-editor")} style={fieldEditorStyle}>
						<EditorChooser active={this.state.activeEditorMode} onChange={this.onActiveEditorChange} />
						<Editor active={this.state.activeEditorMode} {...this.getEditorProps()} />
					</div>
			)}
			</DraggableHeight>
		);
	}

	getFieldsMap(props: LajiFormEditorProps) {
		function fieldsMapper(container: any, fields: FieldOptions[]) {
			return fields.reduce((_container, field) => {
				const _field = field.fields
					? {...field, fields: fieldsMapper({}, field.fields)}
					: field;
				_container[field.name] = _field;
				return _container;
			}, container);
		}
		return fieldsMapper({}, props.json.fields);
	}

	onFieldSelected = (field: string) => {
		this.setState({selected: field});
	}

	getEditorProps(): FieldEditorProps {
		const { schemas, master, lang } = this.props;
		const { selected = "" } = this.state;
		const fieldsMap = this.getFieldsMap(this.props);
		return {
			schema: parseJSONPointer(schemas.schema, fieldPointerToSchemaPointer(schemas.schema, selected || "")),
			uiSchema: parseJSONPointer(master.uiSchema, fieldPointerToUiSchemaPointer(schemas.schema, selected || ""), !!"safely"),
			field: parseJSONPointer({fields: fieldsMap}, (this.state.selected || "").replace(/\//g, "/fields/")),
			translations: master.translations[lang],
			path: selected,
			onChange: this.onEditorChange,
			lang
		};
	}

	onEditorChange = (events: ChangeEvent[]) => {
		events = events.map(event => {
			const {selected = ""} = this.state;
			return { ...event, selected };
		});

		this.props.onChange(events);
	}

	onActiveEditorChange = (newActive: ActiveEditorMode) => {
		this.setState({activeEditorMode: newActive});
	}

}

export interface FieldEditorProps {
	uiSchema: any;
	schema: any;
	field: FieldOptions;
	translations: any;
	path: string;
	onChange: (changed: FieldEditorChangeEvent[]) => void;
	lang: Lang;
}

type OnSelectedCB = (field: string) => void;

const Fields = React.memo(({fields = [], onSelected, selected, pointer, style = {}, className}
	: {fields: FieldProps[], onSelected: OnSelectedCB, selected?: string, pointer: string} & Stylable & Classable) => (
		<div style={{...style, display: "flex", flexDirection: "column", paddingLeft: 20}} className={className}>
			{fields.map((f: FieldProps) => <Field key={f.name} {...f} onSelected={onSelected} selected={selected} pointer={`${pointer}/${f.name}`} />)}
		</div>
));

interface FieldOptions {
	label: string;
	name: string;
	options: any;
	type: string;
	validators: any;
	fields: FieldOptions[];
}
interface FieldProps extends FieldOptions {
	pointer: string;
	selected?: string;
	onSelected: OnSelectedCB;
	fields: FieldProps[];
}
interface FieldState {
	expanded: boolean;
}
class Field extends React.PureComponent<FieldProps, FieldState> {
	state = {
		expanded: this.isSelected() || false
	};

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

	render() {
		const {label, name, fields = [], selected, pointer} = this.props;
		const className = fields.length
			? this.state.expanded
				? "expanded"
				: "contracted"
			: "nonexpandable";
		return (
			<div className={this.nmspc()}>
				<div className={classNames(this.nmspc(this.isSelected() && "selected"))}>
					<Clickable key="expand" onClick={fields.length ? this.toggleExpand : undefined} className={this.nmspc(className)} />
					<Clickable onClick={this.onThisSelected}>{`${name} ${label ? `(${label})` : ""}`}</Clickable>
				</div>
				{this.state.expanded && (
					<Fields
						key="fields"
						fields={fields}
						onSelected={this.onChildSelected}
						selected={selected}
						pointer={pointer}
					/>
				)}
			</div>
		);
	}
}
const LangChooser = React.memo(({lang, onChange}: {lang: Lang, onChange: (lang: Lang) => void}) => (
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
));


type ActiveEditorMode = "uiSchema" | "basic";
const EditorChooser = React.memo(({active, onChange}: {active: ActiveEditorMode, onChange: (activeEditorMode: ActiveEditorMode) => void}) => (
	<div className="btn-group">{
		["basic", "uiSchema"].map((_active: ActiveEditorMode) => (
			<Button
				className="btn-xs"
				active={_active === active}
				onClick={React.useCallback(() => onChange(_active), [_active])}
				key={_active}
			>{_active}
			</Button>
		))
	}</div>
));

interface EditorProps extends FieldEditorProps {
	active: ActiveEditorMode;
}
const Editor = React.memo(({active, ...props}: EditorProps) => (
	active === "uiSchema" && <UiSchemaEditor {...props} /> || null
));
