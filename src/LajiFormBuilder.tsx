import * as React from "react";
const LajiForm = require("laji-form/lib/components/LajiForm").default;
import ApiClient from "./ApiClientImplementation";
import _Spinner from "react-spinner";
import * as LajiFormUtils from "laji-form/lib/utils";
const { parseJSONPointer, parseSchemaFromFormDataPointer, updateSafelyWithJSONPath, isObject } = LajiFormUtils;
import PropTypes from "prop-types";
import parsePropTypes from "parse-prop-types";
import memoize from "memoizee";
import JSONEditor from "react-json-editor-ajrm";

const classNames = (...cs: any[]) => cs.filter(s => typeof s === "string").join(" ");
const CSS_NAMESPACE = "ljb";
const nmspc = (_nmspc?: string) => (s?: any) => s === undefined
		? `${CSS_NAMESPACE}${_nmspc ? `-${_nmspc}` : ""}`
		: s
			? `${CSS_NAMESPACE}${_nmspc ? `-${_nmspc}` : ""}-${s}`
			: "";
const gnmspc  = nmspc();

const fieldPointerToSchemaPointer = (schema: any, pointer: string): string => {
	let schemaPointer = schema;
	return pointer.split("/").filter(s => s).reduce((resultPointer: string, s): string => {
		if (schemaPointer.items && schemaPointer.items.properties) {
			schemaPointer = schemaPointer.items.properties[s];
			return `${resultPointer}/items/properties/${s}`;
		}
		if (schemaPointer.properties) {
			schemaPointer = schemaPointer.properties[s];
			return `${resultPointer}/properties/${s}`;
		}
		throw new Error(`failed to parse field schema pointer ${pointer}`);
	}, "");
}
const fieldPointerToUiSchemaPointer = (schema: any, pointer: string): string => {
	let schemaPointer = schema;
	return pointer.split("/").filter(s => s).reduce((resultPointer: string, s): string => {
		if (schemaPointer.items && schemaPointer.items.properties) {
			schemaPointer = schemaPointer.items.properties[s];
			return `${resultPointer}/items/${s}`;
		}
		if (schemaPointer.properties) {
			schemaPointer = schemaPointer.properties[s];
			return `${resultPointer}/${s}`;
		}
		throw new Error(`failed to parse field uischema pointer ${pointer}`);
	}, "");
}

//declare module "react-spinner" {
//		//	interface Spinner {
//		//		style: any;
//		//	}
//		// or
//	interface _Spinner extends AppProps { className?: string }
//	interface Spinner extends AppProps { }
//}
//
const Spinner = React.memo(({color = "white"}: {color: "white" | "black"}) =>
	<_Spinner  />
	//<_Spinner className={color === "black" ? "bg-black" : ""} /> // TODO typescrit can't dig it...
)

type Lang = "fi" | "sv" | "en";

export interface LajiFormBuilderProps {
	id: string;
	lang: Lang;
	accessToken: string;
}

export interface LajiFormBuilderState {
	id?: string;
	master?: "loading" | any;
	schemas?: "loading" | any;
	json?: "loading" | any;
	uiSchema?: any;
	lang: Lang;
}

const getTranslatedUiSchema = memoize((uiSchema: any, translations: any): any => {
	function translate(obj: any): any {
		if (isObject(obj)) {
			return Object.keys(obj).reduce((translated, key) => ({
				...translated,
				[key]: translate(obj[key])
			}), {});
		} else if (Array.isArray(obj)) {
			return obj.map(translate);
		}
		if (typeof obj === "string" && obj[0] === "@") {
			return translations[obj];
		}
		return obj;
	}
	return translate(uiSchema);
});

export default class LajiFormBuilder extends React.PureComponent<LajiFormBuilderProps, LajiFormBuilderState> {
	apiClient: any;
	formApiClient: any;
	state: LajiFormBuilderState = {
		master: "loading",
		schemas: "loading",
		json: "loading",
		lang: this.props.lang
	};
	lajiFormRef: React.Ref<any>;
	getSetLangFor: {[lang in Lang]: () => void} = ["fi", "sv", "en"].reduce((fns, lang: Lang) => ({
		...fns, [lang]: () => this.setState({lang})
	}), {} as any);

	static defaultProps = {
		lang: "fi",
		id: "JX.519"
	};

	constructor(props: LajiFormBuilderProps) {
		super(props);
		const {lang, accessToken} = props;
		this.apiClient = new ApiClient(
			"https://apitest.laji.fi/v0",
			accessToken,
			lang
		);
		this.formApiClient = new ApiClient(
			"https://cors-anywhere.herokuapp.com/http://formtest.laji.fi/lajiform",
			accessToken,
		);
		this.lajiFormRef = React.createRef();
	}

	componentDidMount() {
		this.updateFromId(this.props.id);
	}

	componentWillReceiveProps({id, lang}: LajiFormBuilderProps) {
		lang !== this.props.lang && this.apiClient && this.apiClient.setLang(lang);
		this.updateFromId(id);
	}

	updateFromId(id: string) {
		if (id !== this.state.id) {
			this.setState({master: "loading", schemas: "loading", json: "loading"}, () => {
				this.formApiClient.fetch(`/${id}`).then((response: any) => response.json()).then((data: any) => this.setState({master: data}));
				[["schemas", "schema"], ["schemas", "schema"], ["json"]].forEach(
					([stateProp, format]) => this.apiClient.fetch(`/forms/${id}`, {lang: this.props.lang, format: format || stateProp})
						.then((response: any) => response.json())
					.then((data: any) => this.setState({id, [stateProp]: data} as Pick<LajiFormBuilderState, "id" | "schemas" | "json">))
				);
			}
			);
		}
	}

	render() {
		return (
			<div>
					{this.renderLajiForm()}
				<div style={{ position: "absolute", display: "flex", flexDirection: "column" }}>
					{this.renderLangChooser()}
					{this.renderEditor()}
				</div>
			</div>
		);
	}

	renderLajiForm() {
		if (this.state.schemas === "loading" || this.state.master === "loading") {
			return <Spinner color="black" />;
		}
		const uiSchema = getTranslatedUiSchema(this.state.master.uiSchema, this.state.master.translations[this.state.lang]);
		return <LajiForm {...this.props} {...this.state.schemas} uiSchema={uiSchema} apiClient={this.apiClient} ref={this.lajiFormRef} />;
	}

	renderEditor() {
		const {json, schemas, uiSchema, master} = this.state;
		return json === "loading" || master === "loading"
			? <Spinner color="black" />
				: (
					<LajiFormEditor
							master={master}
							json={json}
							schemas={schemas}
							onChange={this.onEditorChange}
							lajiFormRef={this.lajiFormRef}
							lang={this.state.lang}
					/>
				);
	}

	renderLangChooser = () => {
		return (
			<div className="btn-group">{
				["fi", "sv", "en"].map((lang: Lang) => (
					<Button
						active={this.state.lang === lang}
						onClick={this.getSetLangFor[lang]}
						key={lang}
					>{lang}
					</Button>
					))
			}</div>
		);
	}

	onEditorChange = (events: ChangeEvent[]) => {
		const changed: any = {master: this.state.master};
		events.forEach(event => {
			if (isUiSchemaChangeEvent(event)) {
				changed.master = {
					...(changed.master || {}),
					uiSchema: updateSafelyWithJSONPath(
						this.state.master.uiSchema,
						event.uiSchema,
						fieldPointerToUiSchemaPointer(this.state.schemas.schema, event.selected)
					)
				};
			} else {
				const {key, value} = event;
				changed.master = {
					...(changed.master || {}),
					translations: ["fi", "sv", "en"].reduce((translations: any, lang: Lang) => ({
						...translations,
						[lang]: {
							...translations[lang],
							[key]: lang === this.state.lang
							? value
							: this.state.master.translations[lang][key]
							|| value
						}
					}), this.state.master.translations)
				};
			}
		});
		this.setState(changed);
	}
}

const Clickable = React.memo(({children, onClick, className}: {children?: React.ReactNode, onClick?: (e: React.MouseEvent) => any} & Classable) =>
	<span onClick={onClick} tabIndex={onClick ? 0 : undefined} className={classNames(gnmspc("clickable"), className)}>{children || <span>&#8203;</span>}</span>
);

interface UiSchemaChangeEvent {
	type: "uiSchema";
	uiSchema: any;
	selected: string;
}
interface TranslationsChangeEvent {
	type: "translations";
	key: any;
	value: any;
}

function isUiSchemaChangeEvent(event: ChangeEvent): event is UiSchemaChangeEvent {
	return event.type === "uiSchema";
}
function isTranslationsChangeEvent(event: ChangeEvent): event is TranslationsChangeEvent {
	return event.type === "translations";
}

type ChangeEvent = UiSchemaChangeEvent | TranslationsChangeEvent;
type FieldEditorChangeEvent = Omit<UiSchemaChangeEvent, "selected"> | TranslationsChangeEvent;

export interface Stylable {
	style?: React.CSSProperties;
}
export interface Classable {
	className?: string;
}
export interface AppProps extends Stylable, Classable { }

interface Schemas {
	schema: any;
	uiSchema: any;
}

export interface CommonEditorProps {
	master: any;
	schemas: Schemas;
	onChange: (changed: ChangeEvent[]) => void;
	lajiFormRef: React.Ref<any>;
	lang: Lang;
}

export interface LajiFormEditorProps extends CommonEditorProps {
	json: {
		fields: FieldProps[];
	};
}

export interface FieldMap {
	[field: string]: FieldMap;
}
export interface LajiFormEditorState {
	selected?: string;
}
class LajiFormEditor extends React.PureComponent<LajiFormEditorProps & Stylable, LajiFormEditorState> {
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
				borderTop: "1px solid gray",
				left: 0,
		}
		const fieldsStyle: React.CSSProperties = {
			overflowY: "scroll",
			display: "flex",
			flexDirection: "column",
			paddingLeft: "20px",
			overflowX: "auto",
		};
		const fieldEditorStyle: React.CSSProperties = {
			overflowY: "scroll",
			overflowX: "auto",
			width: "100%"
		};
		return (
			<div style={containerStyle}>
				<Fields style={fieldsStyle} fields={this.props.json.fields} onSelected={this.onFieldSelected} selected={this.state.selected} pointer="" />
					<div style={fieldEditorStyle}>
						<FieldEditor onChange={this.onEditorChange} lajiFormRef={this.props.lajiFormRef} {...this.getEditorProps()} />
					</div>
			</div>
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

//const Button = React.memo(({children, active, className, ...props}: {children: React.ReactNode, active: boolean, props?: React.HTMLAttributes<HTMLButtonElement>}) =>
const Button = React.memo(({children, active, className, ...props}: any) =>
	<button type="button" role="button" className={classNames("btn", className, active && "active")} {...props}>{children}</button>
);

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
class FieldEditor extends React.PureComponent<FieldEditorProps> {
	static defaultProps = {
		uiSchema: {}
	};
	getEditorSchema = memoize((lajiFormInstance: any, uiSchema: any, schema: any): any => {
		if (!lajiFormInstance) {
			return null;
		}
		const registry = lajiFormInstance.formRef.getRegistry.call({
			props: lajiFormInstance.formRef.props
		});
		const {"ui:field": uiField, "ui:widget": uiWidget} = uiSchema;
		const component = uiField && registry.fields[uiField] || uiWidget && registry.widgets[uiWidget];
		const componentPropTypes = component && parsePropTypes(component);
		const propTypesToSchema = (propTypes: any): any => {
			const name = propTypes.name || (propTypes.type || {}).name;
			const value = propTypes.value || (propTypes.type || {}).value;
			switch (name) {
				case "shape":
					return {type: "object", properties: Object.keys(value).reduce((properties, prop) => ({
						...properties,
						[prop]: propTypesToSchema(value[prop])
					}), {})};
				case "arrayOf":
					return {type: "array", items: propTypesToSchema(value)};
				case "oneOf":
					return {type: "string", enum: value, enumNames: value};
				case "string":
					return {type: "string"};
				case "number":
					return {type: "number"};
				case "object":
				case "custom":
					return {type: "object", properties: {}};
				default:
					console.warn(`Unhandled PropType type ${name}`);
					return {type: "object", properties: {}};
			}
		};
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
			return {
				..._schema,
				properties: {
					...defaultProps.properties,
					..._schema.properties
				}
			}
		} else {
			return defaultProps;
		}
	});
	getEditorUiSchema = memoize((lajiFormInstance: any, uiSchema: any): any => {
		if (!lajiFormInstance) {
			return null;
		}
		const registry = lajiFormInstance.formRef.getRegistry.call({
			props: lajiFormInstance.formRef.props
		});
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
					return {};
				default:
					return {["ui:field"]: "TextareaEditorField"};
			};
			return {};
		}
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

	getLajiFormInstance = () => ((this.props.lajiFormRef as any).current);

	render() {
		if (!this.props.schema) {
			return null;
		}

		const lajiFormInstance = this.getLajiFormInstance();

		const schema = this.getEditorSchema(lajiFormInstance, this.props.uiSchema, this.props.schema);
		const uiSchema = this.getEditorUiSchema(lajiFormInstance, this.props.uiSchema);
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
		const lajiFormInstance = this.getLajiFormInstance();
		let translationsChanged = false;
		let masterUiSchemaChanged = false;
		let translationKey, translationValue;
		changedPaths.forEach(changedPath => {
			const schemaForUiSchema = parseSchemaFromFormDataPointer(this.getEditorSchema(lajiFormInstance, uiSchema, schema), changedPath);
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
