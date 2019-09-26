import * as React from "react";
const LajiForm = require("laji-form/lib/components/LajiForm").default;
import ApiClient from "./ApiClientImplementation";
import _Spinner from "react-spinner";

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
}

export default class LajiFormBuilder extends React.PureComponent<LajiFormBuilderProps, LajiFormBuilderState> {
	apiClient: any;
	state: LajiFormBuilderState = {
		schemas: "loading",
		json: "loading"
	};

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
		return this.state.schemas === "loading"
			? <Spinner color="black" />
			: <LajiForm {...this.props} {...this.state.schemas} apiClient={this.apiClient} />;
	}

	renderEditor() {
		const {json, schemas} = this.state;
		return json === "loading"
			? <Spinner color="black" />
			: <LajiFormEditor json={json} schemas={schemas}/>;
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

export interface LajiFormEditorProps {
	schemas: any;
	json: {
		fields: FieldProps[];
	};
}
export interface LajiFormEditorState {
	selected?: string;
}
class LajiFormEditor extends React.PureComponent<LajiFormEditorProps & Stylable, LajiFormEditorState> {
	state = {selected: undefined};
	render() {
		return <Fields fields={this.props.json.fields} onSelected={this.onFieldSelected} selected={this.state.selected} pointer="" />;
	}

	onFieldSelected = (field: string) => {
		this.setState({selected: field});
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
	fields: FieldProps[];
}
interface FieldProps extends FieldOptions {
	pointer: string;
	selected?: string;
	onSelected: OnSelectedCB;
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
