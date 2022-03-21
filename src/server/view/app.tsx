import LajiFormBuilder from "../../client/components/Builder";
import config from "../../../config.json";
import * as React from "react";
import { render } from "react-dom";
import LajiForm from "laji-form/lib/components/LajiForm";
import lajiFormBs3 from "../../client/themes/bs3";
import ApiClientImplementation from "./ApiClientImplementation";

import "../../client/styles";

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

(async () => {
	const form = await formApiClient.fetchJSON(`/${id}`, {lang, format: "schema"});
	const formData = form?.options?.prepopulatedDocument || {};

	const LajiFormApp = () => {
		const [_form, onChange] = React.useState(form);
		const [_lang, onLangChange] = React.useState(lang);
		console.log(id, _form);
		return (
			<React.Fragment>
				<LajiForm {..._form}
					        lang={_lang}
					        formData={formData}
					        apiClient={apiClient}
					        theme={lajiFormBs3}
					        uiSchemaContext={{}}
					        className={_lang}
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
