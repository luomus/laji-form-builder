import * as React from "react";
import memoize from "memoizee";
import parsePropTypes from "parse-prop-types";
import JSONEditor from "react-json-editor-ajrm";
const LajiForm = require("laji-form/lib/components/LajiForm").default;
import LajiFormInterface from "./LajiFormInterface";
import { DraggableHeight, DraggableWidth, Clickable, Button, Stylable } from "./components";
import { classNames, nmspc, propTypesToSchema, getComponentPropTypes, getTranslatedUiSchema, fieldPointerToSchemaPointer, fieldPointerToUiSchemaPointer } from "./utils";
import { ChangeEvent, TranslationsChangeEvent, UiSchemaChangeEvent, Lang, Schemas } from "./LajiFormBuilder";
import * as LajiFormUtils from "laji-form/lib/utils";
const { parseJSONPointer, parseSchemaFromFormDataPointer, updateSafelyWithJSONPath, isObject } = LajiFormUtils;

type FieldEditorChangeEvent = Omit<UiSchemaChangeEvent, "selected"> | TranslationsChangeEvent;

export interface CommonEditorProps {
	master: any;
	schemas: Schemas;
	onChange: (changed: ChangeEvent[]) => void;
	lang: Lang;
}

export interface LajiFormEditorProps extends CommonEditorProps {
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
}
export class LajiFormEditor extends React.PureComponent<LajiFormEditorProps & Stylable, LajiFormEditorState> {
	state = {selected: undefined};
	render() {
		const containerStyle: React.CSSProperties = {
				display: "flex",
				flexDirection: "row",
				position: "fixed",
				bottom: 0,
				background: "white",
				zIndex: 10000,
				width: "100%",
				height: "200px",
				left: 0,
		}
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
			<DraggableHeight style={containerStyle} height={400}>
				<DraggableWidth style={fieldsBlockStyle}>
					<LangChooser lang={this.props.lang} onChange={this.props.onLangChange} />
					<Fields style={fieldsStyle} fields={this.props.json.fields} onSelected={this.onFieldSelected} selected={this.state.selected} pointer="" />
				</DraggableWidth>
				<div style={fieldEditorStyle}>
					<FieldEditor onChange={this.onEditorChange} {...this.getEditorProps()} />
				</div>
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

	getEditorProps(): any {
		const { schemas, json, master, lang } = this.props;
		const { selected = "" } = this.state;
		if (!selected) {
			return {};
		}
		const fieldsMap = this.getFieldsMap(this.props);
		return {
			schema: parseJSONPointer(schemas.schema, fieldPointerToSchemaPointer(schemas.schema, selected || "")),
			uiSchema: parseJSONPointer(master.uiSchema, fieldPointerToUiSchemaPointer(schemas.schema, selected || ""), !!"safely"),
			field: parseJSONPointer({fields: fieldsMap}, (this.state.selected || "").replace(/\//g, "/fields/")),
			translations: master.translations[lang],
			path: selected
		};
	}

	onEditorChange = (events: ChangeEvent[]) => {
		events = events.map(event => {
			const {selected = ""} = this.state;
			return { ...event, selected };
		});

		this.props.onChange(events);
	}

}

const TextareaEditorField = (props: any) => {
	const label = props.label || props.title || props.name;
	const value = props.hasOwnProperty("formData") ? props.formData : props.value;
	let _lajiFormId: any;
	const filterLajiFormId = (_value: any) => {
		if (isObject(_value) && _value._lajiFormId) {
			const {_lajiFormId: lajiFormId, ...remaining} = _value;
			_lajiFormId = lajiFormId;
			return remaining;
		}
		return _value;
	};
	const onChange = React.useCallback((({jsObject}: any) => props.onChange(_lajiFormId ? {...jsObject, _lajiFormId} : jsObject)), [props.onChange])
	return  (
		<React.Fragment>
			{label}
			{isObject(value) || Array.isArray(value) ? (
				<JSONEditor
					placeholder={filterLajiFormId(props.formData || props.value)}
					onChange={onChange}
					locale="en"
					height={100}
				/>
				) : (
					<input value={value} />
			)}
		</React.Fragment>
	);
};

interface FieldEditorProps extends CommonEditorProps {
	uiSchema?: any;
	schema?: any;
	field?: FieldOptions;
	translations?: any;
	path?: string;
	onChange: (changed: FieldEditorChangeEvent[]) => void;
}

const customPropTypeSchemaMappings: {
	[propName: string]: {
		schema?: (schema: any, rootSchema: any) => any,
		uiSchema?: (schema: any, rootSchema: any) => any
	}} = {
	"ui:widget": {
		schema: (_schema, rootSchema: any): any => {
			const {type: _type} = rootSchema;
			const _enum = ["", ...Object.keys(LajiFormInterface.getWidgetTypes()[_type])];
			return {type: "string", enum: [], enumNames: []};
		}
	},
	"ui:field": {
		schema: (_schema, rootSchema): any => {
			const {type: _type} = rootSchema;
			const _enum = ["", ...Object.keys(LajiFormInterface.getFieldTypes()[_type])];
			return {type: "string", enum: _enum, enumNames: _enum};
		}
	}
};

const customize = (schemaForUiSchema: any, rootSchema: any): any => {
	if (schemaForUiSchema.properties) {
		return {...schemaForUiSchema, properties: Object.keys(schemaForUiSchema.properties).reduce((properties: any, prop: string): any => {
			let propSchema = schemaForUiSchema.properties[prop];
			const {schema: replace} = customPropTypeSchemaMappings[prop] || {};
			if (replace) {
				propSchema = replace(schemaForUiSchema.properties[prop], rootSchema);
			}
			return {...properties, [prop]: customize(propSchema, rootSchema)};
		}, {})};
	} else if (schemaForUiSchema.type === "array" && schemaForUiSchema.items.properties) {
		return {
			...schemaForUiSchema,
			items: {
				...schemaForUiSchema.items,
				properties: Object.keys(schemaForUiSchema.items.properties).reduce((properties, prop) => ({
					...properties,
					[prop]: customize(schemaForUiSchema.items.properties[prop], rootSchema)
				}), {})
			}
		};
	}
	return schemaForUiSchema;
};

class FieldEditor extends React.PureComponent<FieldEditorProps> {
	static defaultProps = {
		uiSchema: {}
	};
	getEditorSchema = memoize((uiSchema: any, schema: any): any => {
		const registry = LajiFormInterface.getRegistry();
		const {"ui:field": uiField, "ui:widget": uiWidget} = uiSchema;
		const component = uiField && registry.fields[uiField] || uiWidget && registry.widgets[uiWidget];
		const componentPropTypes = getComponentPropTypes(component);
		const addWidgetOrField = ((schemaForUiSchema: any, _schema: any) => {
			return (_schema.type === "object" || _schema.type === "array")
				? {...schemaForUiSchema, properties: {...schemaForUiSchema.properties, "ui:field": {type: "string"}}}
				: {...schemaForUiSchema, properties: {...schemaForUiSchema.properties, "ui:widget": {type: "string"}}};
		});
		const defaultProps = addWidgetOrField({
			type: "object",
			properties: {
				"ui:title": { type: "string", },
				"ui:description": { type: "string", },
				"ui:help": { type: "string", },
				"className": { type: "string", }
			}
		}, schema);
		if ((componentPropTypes || {}).uiSchema) {
			const _schema = propTypesToSchema((componentPropTypes || {}).uiSchema);
			return customize({
				..._schema,
				properties: {
					...defaultProps.properties,
					..._schema.properties
				}
			}, schema)
		} else {
			return customize(defaultProps, schema);
		}
	});
	getEditorUiSchema = memoize((uiSchema: any): any => {
		const registry = LajiFormInterface.getRegistry();
		const {"ui:field": uiField, "ui:widget": uiWidget} = this.props.uiSchema;
		const component = uiField && registry.fields[uiField] || uiWidget && registry.widgets[uiWidget];
		const componentPropTypes = component && parsePropTypes(component);
		const propTypesToUiSchema = (propTypes: any): any => {
			const name = propTypes.name || (propTypes.type || {}).name;
			const value = propTypes.value || (propTypes.type || {}).value;
			switch (name) {
				case "shape":
					return Object.keys(value).reduce((properties, prop) => ({
						...properties,
						[prop]: propTypesToUiSchema(value[prop])
					}), {});
				case "arrayOf":
					return {items: propTypesToUiSchema(value)};
				case "string":
				case "number":
				case "oneOf":
				case "bool":
					return {};
				default:
					return {["ui:field"]: "TextareaEditorField"};
			}
			return {};
		};
		return (componentPropTypes || {}).uiSchema ? propTypesToUiSchema((componentPropTypes || {}).uiSchema) : {};
	});

	getFieldName(): string {
		const {uiSchema = {}, field} = this.props;
		if (!field) {
			return "";
		}
		const { "ui:title": uiTitle } = getTranslatedUiSchema(this.props.uiSchema, this.props.translations);
		return typeof uiTitle === "string"
			? uiTitle
			: typeof field.label === "string"
				? field.label
				: field.name;
	}

	render() {
		if (!this.props.schema) {
			return null;
		}

		const schema = this.getEditorSchema(this.props.uiSchema, this.props.schema);
		const uiSchema = this.getEditorUiSchema(this.props.uiSchema);
		const formData = {
			...getTranslatedUiSchema(this.props.uiSchema, this.props.translations),
			"ui:title": this.getFieldName()
		};
		const fields = { TextareaEditorField };
		return <LajiForm schema={schema} uiSchema={uiSchema} formData={formData} onChange={this.onEditorLajiFormChange} fields={fields}/>;
	}

	onEditorLajiFormChange = (newViewUiSchema: any) => {
		const viewUiSchema = getTranslatedUiSchema(this.props.uiSchema, this.props.translations);
		let { uiSchema, translations } = this.props;
		const { schema } = this.props;
		const detectChangePaths = (_uiSchema: any, path: string): string[] => {
			if (isObject(_uiSchema)) {
				return Object.keys(_uiSchema).reduce((paths, key) => {
					const changes = detectChangePaths(_uiSchema[key], `${path}/${key}`);
					return changes.length ? [...paths, ...changes] : paths;
				}, []);
			} else if (Array.isArray(_uiSchema)) {
				return _uiSchema.reduce((paths, item, idx) => {
					const changes = detectChangePaths(item, `${path}/${idx}`);
					return changes.length ? [...paths, ...changes] : paths;
				}, []);
			}
			if (parseJSONPointer(newViewUiSchema, path) !== parseJSONPointer(viewUiSchema, path)) {
				return [path];
			}
			return [];
		};
		const changedPaths = detectChangePaths(newViewUiSchema, "");
		let translationsChanged = false;
		let masterUiSchemaChanged = false;
		let translationKey, translationValue;
		changedPaths.forEach(changedPath => {
			const schemaForUiSchema = parseSchemaFromFormDataPointer(this.getEditorSchema(uiSchema, schema), changedPath);
			if (schemaForUiSchema.type === "string" && !schemaForUiSchema.enum) {
				translationsChanged = true;
				const masterValue = parseJSONPointer(uiSchema, changedPath);
				const newValue = parseJSONPointer(newViewUiSchema, changedPath);
				if (masterValue && masterValue[0] === "@") {
					translations = {...translations, [masterValue]: newValue};
				} else {
					translationKey = `@${this.props.path}${changedPath}`;
					translationValue = newValue;
					translations = {...translations, [translationKey]:  newValue};
					uiSchema = updateSafelyWithJSONPath(uiSchema, translationKey, changedPath);
					masterUiSchemaChanged = true;
				}
			}
		});
		const events: FieldEditorChangeEvent[] = [];
		if (translationsChanged) {
			events.push({type: "translations", key: translationKey, value: translationValue});
		}
		if (masterUiSchemaChanged) {
			events.push({type: "uiSchema", uiSchema});
		}
		(translationsChanged || masterUiSchemaChanged) && this.props.onChange(events);
	}
}

type OnSelectedCB = (field: string) => void;

const Fields = React.memo(({fields = [], onSelected, selected, pointer, style = {}}
	: {fields: FieldProps[], onSelected: OnSelectedCB, selected?: string, pointer: string} & Stylable) => (
		<div style={{...style, display: "flex", flexDirection: "column", paddingLeft: 20}}>
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
const LangChooser = React.memo(({lang, onChange}: {lang: Lang, onChange: (lang: Lang) => void}) => {
	return (
		<div className="btn-group">{
			["fi", "sv", "en"].map((_lang: Lang) => (
				<Button
					active={_lang === lang}
					onClick={React.useCallback(() => onChange(_lang), [_lang])}
					key={_lang}
				>{_lang}
			</Button>
				))
		}</div>
	);
});

