import LajiFormBuilder from "../../client/components/Builder";
import * as config from "../../../config.json";
import * as React from "react";
import { render } from "react-dom";
import LajiForm, { Notifier } from "laji-form/lib/components/LajiForm";
import lajiFormBs3 from "../../client/themes/bs3";
import FormService from "../../client/services/form-service";
import "../../client/styles";
import "notus/src/notus.css";
import  _notus from "notus";
import { isLang, Lang, SchemaFormat } from "../../model";
import ApiClient, { ApiClientImplementation } from "../../api-client";
import {classNames} from "../../client/utils";
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
const initialLang = initialRoute.lang || DEFAULT_LANG;


const apiClientImplementation = new ApiClientImplementation(
	config.apiBase,
	config.accessToken,
	config.personToken
);

const apiClient = new ApiClient(apiClientImplementation, initialLang);

const formApiClientImplementation = new ApiClientImplementation(
	config.formApiBase,
	config.accessToken
);

const formApiClient = new ApiClient(formApiClientImplementation, initialLang);

const formService = new FormService(
	apiClient,
	initialLang,
	formApiClient,
);

(async () => {
	// State is stored in "route" object, which is purely reduced from the browser URI.
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
			setUri(`${window.location.origin}/${uri}`);
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

		// Needed for e2e tests detecting when form previewer gets new schema with new lang.
		const propsForTestEnv = {
			className: classNames(lang, "rjsf")
		};
		const [key, setKey] = React.useState(0);

		const onRemountLajiForm =  React.useCallback(() => {
			setKey(key + 1);
		}, [key]);

		return (
			<React.Fragment>
				<LajiForm key={key}
				          {...form}
				          {...propsForTestEnv}
				          lang={lang}
				          formData={formData}
				          apiClient={apiClient}
				          theme={lajiFormBs3}
				          notifier={notifier}
				          renderSubmit={false}
				          showShortcutButton={false} />
				<LajiFormBuilder id={id}
					               lang={route.lang}
					               {...config}
					               onChange={onChange}
					               onLangChange={setLang}
					               apiClient={apiClientImplementation}
					               formApiClient={formApiClientImplementation}
					               theme={lajiFormBs3}
												 allowList={true}
				                 onSelected={onSelected}
				                 notifier={notifier}
				                 onRemountLajiForm={onRemountLajiForm}
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
