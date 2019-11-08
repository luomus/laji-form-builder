import * as React from "react";
const LajiForm = require("laji-form/lib/components/LajiForm").default;
import ApiClient from "./ApiClientImplementation";
import * as LajiFormUtils from "laji-form/lib/utils";
const { updateSafelyWithJSONPath } = LajiFormUtils;
import { Button, Spinner } from "./components";
import { getTranslatedUiSchema, fieldPointerToUiSchemaPointer } from "./utils";
import LajiFormInterface from "./LajiFormInterface";
import { LajiFormEditor } from "./LajiFormEditor";

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
export default class LajiFormBuilder extends React.PureComponent<LajiFormBuilderProps, LajiFormBuilderState> {
	apiClient: any;
	formApiClient: any;
	state: LajiFormBuilderState = {
		master: "loading",
		schemas: "loading",
		json: "loading",
		lang: this.props.lang
	};
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
				// TODO fix formtest
				this.setState({master: require(`../forms/${id}.json`)});
				//this.formApiClient.fetch(`/${id}`).then((response: any) => response.json()).then((data: any) => this.setState({master: data}));
				[["schemas", "schema"], ["schemas", "schema"], ["json"]].forEach(
					([stateProp, format]) => this.apiClient.fetch(`/forms/${id}`, {lang: this.props.lang, format: format || stateProp})
						.then((response: any) => response.json())
					.then((data: any) => this.setState({id, [stateProp]: data} as Pick<LajiFormBuilderState, "id" | "schemas" | "json">))
				);
			}
			);
		}
	}

	onLangChange = (lang: Lang) => {
		this.setState({lang});
	}

	render() {
		return (
			<div>
					{this.renderLajiForm()}
				<div style={{ position: "absolute", display: "flex", flexDirection: "column" }}>
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
		return <LajiForm {...this.props} {...this.state.schemas} uiSchema={uiSchema} apiClient={this.apiClient} />;
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
							lang={this.state.lang}
							onLangChange={this.onLangChange}
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
						event.value,
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
								: (this.state.master.translations[lang][key] || value)
						}
					}), this.state.master.translations)
				};
			}
		});
		this.setState(changed);
	}
}

export type Lang = "fi" | "sv" | "en";

export interface UiSchemaChangeEvent {
	type: "uiSchema";
	value: any;
	selected: string;
}
export interface TranslationsChangeEvent {
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

export type ChangeEvent = UiSchemaChangeEvent | TranslationsChangeEvent;

export interface Schemas {
	schema: any;
	uiSchema: any;
}
