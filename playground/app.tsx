import LajiFormBuilder from "../src/LajiFormBuilder";
import properties from "../properties.json";
import * as React from "react";
import { render } from "react-dom";
import LajiForm from "laji-form/lib/components/LajiForm";
import lajiFormBs3 from "../src/themes/bs3";
import ApiClientImplementation from "./ApiClientImplementation";

import "../src/styles";

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
const {id = "JX.519", lang = "fi", localFormData, ..._query} = query;


const apiClient = new ApiClientImplementation(
	"https://apitest.laji.fi/v0",
	properties.accessToken,
	properties.userToken,
	lang
);
apiClient.fetch(`/forms/${id}`, {lang, format: "schema"}).then(response => response.json()).then(form => {
	const formData = localFormData
		? require(`/forms/${localFormData === true ? id  : localFormData}.formData.json`)
		: form.options?.prepopulatedDocument || {};
	const LajiFormApp = () => {
		const [_form, onChange] = React.useState(form);
		const [_lang, onLangChange] = React.useState(lang);
		return (
			<React.Fragment>
				{ _form.name }
				{ _form.description }
				<LajiForm {..._form} lang={_lang} formData={formData} apiClient={apiClient} theme={lajiFormBs3} uiSchemaContext={{}} />
				<LajiFormBuilder id={id} lang={lang} {..._query} {...properties} onChange={onChange} onLangChange={onLangChange} apiClient={apiClient} theme={lajiFormBs3} />
			</React.Fragment>
		);
	};

	render(
		React.createElement(LajiFormApp),
		document.querySelector("#app")
	);
});
