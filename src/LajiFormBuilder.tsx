import * as React from "react";
const LajiForm = require("laji-form/lib/components/LajiForm").default;
import ApiClient from "./ApiClientImplementation";
import _Spinner from "react-spinner";

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

export interface HasStyle {
	style?: React.CSSProperties;
}

export interface AppProps {
	style?: React.CSSProperties;
	className?: string;
}

export interface LajiFormEditorProps {
	schemas: any;
	json: {
		fields: FieldProps[];
	};
}

class LajiFormEditor extends React.PureComponent<LajiFormEditorProps & HasStyle> {
	render() {
		return <Fields fields={this.props.json.fields} />;
	}
}

const Fields = React.memo(
	({fields = []}: {fields: FieldProps[]}) => (
		<div style={{display: "flex", flexDirection: "column", paddingLeft: 20}}>
			{fields.map((f: FieldProps) => <Field key={f.name} {...f} />)}
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
	selected: boolean;
}
interface FieldState {
	expanded: boolean;
}
class Field extends React.PureComponent<FieldProps, FieldState> {
	state = {
		expanded: this.props.selected
	};

	toggleExpand = () => {
		this.setState({expanded: !this.state.expanded});
	}

	render() {
		const {label, name, fields = []} = this.props;
		const prefix = fields.length
			? this.state.expanded
				? "▼"
				: "►"
			: "   ";
		return [
			<span key="field" onClick={this.toggleExpand}>{`${prefix} ${name} ${label ? `(${label})` : ""}`}</span>,
			this.state.expanded ? <Fields key="fields" fields={fields} /> : null
		];
	}
}
