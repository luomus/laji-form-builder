import LajiFormBuilder from "../src/LajiFormBuilder";
import properties from "../properties.json";
import * as React from "react";
import { render } from "react-dom";
import LajiForm from "laji-form/lib/components/LajiForm";
import lajiFormBs3 from "laji-form/lib/themes/bs3";
import ApiClientImplementation from "../src/ApiClientImplementation";

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
let id = query.id || "JX.519";
let lang = query.lang || "fi";

const apiClient = new ApiClientImplementation(
	"https://apitest.laji.fi/v0",
	properties.accessToken,
	lang
);
apiClient.fetch(`/forms/${id}`, {lang, format: "schema"}).then(response => response.json()).then(form => {
	const LajiFormApp = () => (
		<React.Fragment>
			<LajiForm {...form} lang={lang} apiClient={apiClient} theme={lajiFormBs3} />
			<LajiFormBuilder id={id} lang={lang} {...query} {...properties} />
		</React.Fragment>
	);

	render(
		React.createElement(LajiFormApp),
		document.querySelector("#app")
	);
});
