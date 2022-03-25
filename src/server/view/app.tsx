import LajiFormBuilder from "../../client/components/Builder";
import * as config from "../../../config.json";
import * as React from "react";
import { render } from "react-dom";
import LajiForm, { Notifier } from "laji-form/lib/components/LajiForm";
import lajiFormBs3 from "../../client/themes/bs3";
import ApiClientImplementation from "./ApiClientImplementation";
import lajiFormTranslations from "laji-form/lib/translations.json";
import FormService from "../../client/services/form-service";
import { constructTranslations } from "laji-form/lib/utils";
import ApiClient from "laji-form/lib/ApiClient";
import "../../client/styles";
import "notus/src/notus.css";
import  _notus from "notus";
import { isLang, Lang, SchemaFormat, Translations } from "../../model";

const notus = _notus();

const notifier: Notifier = [
	["warning", "warning"],
	["success", "success"],
	["info", undefined],
	["error", "failure"]
].reduce((notifier, [method, notusType]: [keyof Notifier, string | undefined]) => {
	notifier[method] = message => notus.send({message, alertType: notusType, title: ""});
	return notifier;
}, {} as Notifier);

const DEFAULT_LANG = "fi";

interface RouteState {
	id?: string;
	lang?: Lang;
}

const uriToState = (uri: string) => {
	const uriObj = new URL(uri);
	const idMatch = uriObj.pathname.match(/\/(.+)/);
	const id = idMatch?.[1];
	const langMatch = uriObj.searchParams.get("lang");
	const lang = typeof langMatch !== "string"
		? undefined
		: isLang(langMatch)
			? langMatch
			: DEFAULT_LANG;
	const route: RouteState = {id};
	if (lang) route.lang = lang;
	return route;
};

const initialUri = window.location.href;
const initialRoute = uriToState(initialUri);

const apiClient = new ApiClientImplementation(
	config.apiBase,
	config.accessToken,
	config.userToken,
	initialRoute.lang
);
const formApiClient = new ApiClientImplementation(
	config.formApiBase,
	config.accessToken,
	config.userToken,
	initialRoute.lang
);

const _lajiFormTranslations = constructTranslations(lajiFormTranslations) as unknown as Translations;
const initialLang = initialRoute.lang || DEFAULT_LANG;
const formService = new FormService(
	new ApiClient(
		apiClient,
		initialLang,
		_lajiFormTranslations
	),
	initialLang,
	new ApiClient(
		formApiClient,
		initialLang,
		_lajiFormTranslations
	)
);

(async () => {
	// State is stored in "route" object, which is purely reduces from the browser URI.
	const LajiFormApp = () => {
		const [uri, setUri] = React.useState<string>(initialUri);
		const [route, setRoute] = React.useState<RouteState>(initialRoute);
		const [form, onChange] = React.useState<SchemaFormat | undefined>(undefined);
		const [formData, setFormData] = React.useState<any>(undefined);
		const [lang, setLang] = React.useState<Lang>(initialLang);

		const {id} = route;

		// Reflect given route to URI.
		const updateRoute = React.useCallback((route: RouteState) => {
			let uri = "";
			if (route.id) {
				uri = route.id;
			}
			if (route.lang) {
				uri += `?lang=${route.lang}`;
			}
			history.pushState(undefined, "", uri);
			setUri(`${window.location.host}/${uri}`);
		}, [setUri]);

		// Update our state uri when user navigates in browser uri history.
		React.useEffect(() => {
			const listener = () => {
				setUri(window.location.href);
			};
			window.addEventListener("popstate", listener);
			return () => window.removeEventListener("popstate", listener);
		}, []);

		// When our state uri changes, update our route state.
		React.useEffect(() => {
			setRoute(uriToState(uri));
		}, [uri, setRoute]);

		// Update form & formData on id change.
		React.useEffect(() => {
			const updateForm = async (id: string) => {
				const form = await formService.getSchemaFormat(id);
				onChange(form);
				setFormData(form?.options?.prepopulatedDocument || {});
			};
			if (id) {
				updateForm(id);
			} else {
				onChange({} as any);
				setFormData({});
			}
		}, [id, onChange, setFormData]);

		// Update lang for instances out of React scope.
		React.useEffect(() => {
			apiClient.setLang(lang);
			formApiClient.setLang(lang);
			formService.setLang(lang);
		}, [lang]);

		const onSelected = React.useCallback(async (id: string) => {
			updateRoute({...route, id});
		}, [route, updateRoute]);

		return (
			<React.Fragment>
				<LajiForm {...form}
				          lang={lang}
				          formData={formData}
				          apiClient={apiClient}
				          theme={lajiFormBs3}
				          uiSchemaContext={{}}
				          notifier={notifier}
				/>
				<LajiFormBuilder id={id}
					               lang={route.lang}
					               {...config}
					               onChange={onChange}
					               onLangChange={setLang}
					               apiClient={apiClient}
					               formApiClient={formApiClient}
					               theme={lajiFormBs3}
												 allowList={true}
				                 onSelected={onSelected}
				                 notifier={notifier}
				/>
			</React.Fragment>
		);
	};

	render(
		React.createElement(LajiFormApp),
		document.querySelector("#app")
	);
})();

// For dev server hot reload
if ((module as any).hot) {
	  (module as any).hot.accept();
}
