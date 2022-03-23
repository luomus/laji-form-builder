import LajiFormBuilder from "../../client/components/Builder";
import config from "../../../config.json";
import * as React from "react";
import { render } from "react-dom";
import LajiForm from "laji-form/lib/components/LajiForm";
import lajiFormBs3 from "../../client/themes/bs3";
import ApiClientImplementation from "./ApiClientImplementation";
import lajiFormTranslations from "laji-form/lib/translations.json";
import FormService from "../../client/services/form-service";
import { constructTranslations } from "laji-form/lib/utils";
import ApiClient from "laji-form/lib/ApiClient";
import "../../client/styles";
import { Lang, SchemaFormat, Translations } from "../../model";
import queryString from "querystring";

function getJsonFromUrl() {
	const type = (value: any | string): any => {
		try {
			return JSON.parse(value);
		} catch (e) {
			return value;
		}
	};

	const query = location.search.substr(1);
	const result = {} as any;
	query.split("&").forEach(function(part) {
		const item = part.split("=");
		result[item[0]] = type(decodeURIComponent(item[1]));
	});
	return result;
}

const query = getJsonFromUrl();
const {lang = "fi", ..._query} = query;

const id = location.pathname.substr(1);

const _lajiFormTranslations = constructTranslations(lajiFormTranslations) as unknown as Translations;
const apiClient = new ApiClientImplementation(
	config.apiBase,
	config.accessToken,
	config.userToken,
	lang
);
const formApiClient = new ApiClientImplementation(
	config.formApiBase,
	config.accessToken,
	config.userToken,
	lang
);

const formService = new FormService(
	new ApiClient(
		apiClient,
		lang,
		_lajiFormTranslations
	),
	lang,
	new ApiClient(
		formApiClient,
		lang,
		_lajiFormTranslations
	)
);

(async () => {
	const LajiFormApp = () => {
		const [form, onChange] = React.useState<SchemaFormat | undefined>(undefined);
		const [_lang, setLang] = React.useState(lang);
		const [formData, setFormData] =React.useState<any>(undefined);

		const onSelected = React.useCallback(async (id: string) => {
			const queryObject: any = {};
			if (query.lang) {
				queryObject.lang = query.lang;
			}
			const queryParams = Object.keys(queryObject).length
				? queryString.stringify(queryObject)
				: undefined;
			const uri = id + (queryParams
				? "?" + queryParams
				: "");
			history.pushState(undefined, "", uri);
			const form = await formService.getSchemaFormat(id);
			onChange(form);
			setFormData(form?.options?.prepopulatedDocument || {});
		}, []);

		const onLangChange = React.useCallback((lang: Lang) => {
			setLang(lang);
			formService.setLang(lang);
		}, []);

		React.useEffect(() => {
			id && onSelected(id);
		}, [onSelected]);

		return (
			<React.Fragment>
				<LajiForm {...form}
					        lang={_lang}
					        formData={formData}
					        apiClient={apiClient}
					        theme={lajiFormBs3}
					        uiSchemaContext={{}}
				/>
				<LajiFormBuilder id={id}
					               lang={lang}
					               {..._query}
					               {...config}
					               onChange={onChange}
					               onLangChange={onLangChange}
					               apiClient={apiClient}
					               formApiClient={formApiClient}
					               theme={lajiFormBs3}
												 allowList={true}
				                 onSelected={onSelected}
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
