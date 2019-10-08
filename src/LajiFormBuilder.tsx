import * as React from "react";
const LajiForm = require("laji-form/lib/components/LajiForm").default;
import ApiClient from "./ApiClientImplementation";
import _Spinner from "react-spinner";
import * as LajiFormUtils from "laji-form/lib/utils";
const { parseJSONPointer, parseUiSchemaFromFormDataPointer, parseSchemaFromFormDataPointer, uiSchemaJSONPointer, updateSafelyWithJSONPath } = LajiFormUtils;
import PropTypes from "prop-types";
import parsePropTypes from "parse-prop-types";

const classNames = (...cs: any[]) => cs.filter(s => typeof s === "string").join(" ");

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

export interface LajiFormBuilderProps {
	id: string;
	lang: "fi" | "sv" | "en";
	accessToken: string;
}

export interface LajiFormBuilderState {
	id?: string;
	schemas?: "loading" | any;
	json?: "loading" | any;
	uiSchema?: any;
}

export default class LajiFormBuilder extends React.PureComponent<LajiFormBuilderProps, LajiFormBuilderState> {
	apiClient: any;
	state: LajiFormBuilderState = {
		schemas: "loading",
		json: "loading",
	};
	lajiFormRef: React.Ref<any>;

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
			this.setState({schemas: "loading", json: "loading"}, () =>
				[["schemas", "schema"], ["json"]].forEach(
					([stateProp, format]) => this.apiClient.fetch(`/forms/${id}`, {lang: this.props.lang, format: format || stateProp})
						.then((response: any) => response.json())
						.then((data: any) => this.setState({id, [stateProp]: data}))
				)
			);
		}
	}

	render() {
		return (
			<div style={{ display: "flex", flexDirection: "row" }}>
				{this.renderEditor()}
				{this.renderLajiForm()}
			</div>
		);
	}

	renderLajiForm() {
		const uiSchema = this.state.uiSchema || this.state.schemas.uiSchema;
		return this.state.schemas === "loading"
			? <Spinner color="black" />
			: <LajiForm {...this.props} {...this.state.schemas} uiSchema={uiSchema} apiClient={this.apiClient} ref={this.lajiFormRef} />;
	}

	renderEditor() {
		const {json, schemas, uiSchema} = this.state;
		return json === "loading"
			? <Spinner color="black" />
			: <LajiFormEditor json={json} schemas={schemas} onChange={this.onEditorChange} lajiFormRef={this.lajiFormRef}/>;
	}

	onEditorChange = ({uiSchema, field}: {uiSchema?: any, field?: FieldOptions}) => {
		if (uiSchema) {
			this.setState({schemas: {...this.state.schemas, uiSchema}});
		}
	}
}

const Clickable = React.memo(({children, onClick, className}: {children?: React.ReactNode, onClick?: (e: React.MouseEvent) => any} & Classable) =>
	<span onClick={onClick} tabIndex={onClick ? 0 : undefined} className={classNames("clickable", className)}>{children || <span>&#8203;</span>}</span>
);

export interface Stylable {
	style?: React.CSSProperties;
}
export interface Classable {
	className?: string;
}
export interface AppProps extends Stylable, Classable { }

export interface CommonEditorProps {
	schemas: any;
	onChange: (changed: {uiSchema?: any, json?: any}) => void;
	lajiFormRef: React.Ref<any>;
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
		return (
			<div style={{display: "flex", flexDirection: "column"}}>
				<FieldEditor onChange={this.onEditorChange} lajiFormRef={this.props.lajiFormRef} {...this.getEditorProps()} />
				<Fields fields={this.props.json.fields} onSelected={this.onFieldSelected} selected={this.state.selected} pointer="" />;
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
		const { schemas, json } = this.props;
		const { selected = "" } = this.state;
		if (!selected) {
			return {};
		}
		const fieldsMap = this.getFieldsMap(this.props);
		return {
			schema: parseSchemaFromFormDataPointer(schemas.schema, selected || ""),
			uiSchema: parseUiSchemaFromFormDataPointer(schemas.uiSchema, selected || ""),
			field: parseJSONPointer({fields: fieldsMap}, (this.state.selected || "").replace(/\//g, "/fields/"))
		};
	}

	onEditorChange = ({uiSchema, field}: {uiSchema?: any, field?: FieldOptions}) => {
		const {selected = ""} = this.state;
		if (uiSchema) {
			const uiSchemaPointer = uiSchemaJSONPointer(this.props.schemas.uiSchema, selected);
			this.props.onChange({uiSchema: updateSafelyWithJSONPath(this.props.schemas.uiSchema, uiSchema, selected)});
		}
	}

}

//const Button = React.memo(({children, active, className, ...props}: {children: React.ReactNode, active: boolean, props?: React.HTMLAttributes<HTMLButtonElement>}) =>
const Button = React.memo(({children, active, className, ...props}: any) =>
	<button type="button" role="button" className={classNames("btn", className, active && "active")} {...props}>{children}</button>
);

interface FieldEditorProps extends CommonEditorProps {
	uiSchema?: any;
	field?: FieldOptions;
}
// interface FieldEditorState {
// 	active: "uiSchema" | "editor";
// }
class FieldEditor extends React.PureComponent<FieldEditorProps> {
	// state: FieldEditorState = {
	// 	active: "uiSchema"
	// };

	// setEditorActive = () => {
	// 	this.setState({active: "editor"});
	// }

	// setUiSchemaActive = () => {
	// 	this.setState({active: "uiSchema"});
	// }

	render() {
		return this.renderEditor();
		// return (
		// 	<React.Fragment>
		// 		<div className="btn-group">
		// 			<Button active={this.state.active === "editor"} onClick={this.setEditorActive}>editor</Button>
		// 			<Button active={this.state.active === "uiSchema"} onClick={this.setUiSchemaActive}>uiSchema</Button>
		// 		</div>
		// 		{this.renderEditor()}
		// 	</React.Fragment>
		// );
	}

	getFieldName(): string {
		const {uiSchema = {}, field} = this.props;
		if (!field) {
			return "";
		}
		const { "ui:title": uiTitle } = uiSchema;
		return typeof uiTitle === "string"
			? uiTitle
			: typeof field.label === "string"
				? field.label
				: field.name;
	}

	// onFieldNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
	// 	const { value } = e.target;
	// 	this.props.onChange({uiSchema: {...(this.props.uiSchema || {}), "ui:title": value}});
	// }

	renderEditor() {
		if (!this.props.uiSchema) {
			return null;
		}

		const lajiFormInstance = (this.props.lajiFormRef as any).current; // TODO fix as any
		if (!lajiFormInstance) {
			return null;
		}

		const registry = lajiFormInstance.formRef.getRegistry.call({
			props: lajiFormInstance.formRef.props
		});
		const {"ui:field": uiField, "ui:widget": uiWidget} = this.props.uiSchema;
		const component = uiField && registry.fields[uiField] || uiWidget && registry.widgets[uiWidget];
		const componentPropTypes = component && parsePropTypes(component);
		const propTypesToSchema = (propTypes: any): any => {
			if (propTypes.type) {
				switch (propTypes.type.name) {
					case "shape":
						return {type: "object", properties: Object.keys(propTypes.type.value).reduce((properties, prop) => ({
							...properties,
							[prop]: propTypesToSchema(propTypes.type.value[prop])
						}), {})};
					case "arrayOf":
						return {type: "array", items: propTypesToSchema(propTypes.type.value)};
					case "oneOf":
						return {type: "string", enum: propTypes.value, enumNames: propTypes.value}
				}
			}
			if (propTypes.name) {
				switch (propTypes.name) {
					case "string":
						return {type: "string"}
				}
			}
		}
		const schema = (componentPropTypes || {}).uiSchema
			? propTypesToSchema(componentPropTypes.uiSchema)
		: {
			type: "object",
			properties: {
				"ui:title": {
					type: "string",
					label: "Otsikko"
				},
				"ui:description": {
					type: "string",
					label: "Kuvaus"
				},
				"ui:help": {
					type: "string",
					label: "Aputeksti"
				}
			}
		};

		const formData = {
		//	uiSchema: {
				...this.props.uiSchema,
				"ui:title": this.getFieldName()
		//	}
		};
		return <LajiForm schema={schema} formData={formData} />;
			//return (
			//	<React.Fragment>
			//		<input type="text" value={this.getFieldName()} onChange={this.onFieldNameChange} />
			//	</React.Fragment>
			//)
	}

	renderUiSchemaEditor() {
		//console.log(this.props.uiSchema);
		return (
			<textarea value={JSON.stringify(this.props.uiSchema)} />
		);
	}

	renderAdvancedEditor() {
	}
}

type OnSelectedCB = (field: string) => void;

const Fields = React.memo(
	({fields = [], onSelected, selected, pointer}: {fields: FieldProps[], onSelected: OnSelectedCB, selected?: string, pointer: string}) => (
		<div style={{display: "flex", flexDirection: "column", paddingLeft: 20}}>
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
			<div className="field">
				<div className={classNames(this.isSelected() && "selected")}>
					<Clickable key="expand" onClick={fields.length ? this.toggleExpand : undefined} className={`field-${className}`} />
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
