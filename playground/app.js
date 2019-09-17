import LajiFormBuilder from "../src/app";
import properties from "../properties.json";
import ApiClient from "./ApiClientImplementation";

import "laji-form/dist/styles.css";

function getJsonFromUrl() {
	const type = (value) => {
		try {
			return JSON.parse(value);
		} catch (e) {
			return value;
		}
	};

	let query = location.search.substr(1);
	let result = {};
	query.split("&").forEach(function(part) {
		var item = part.split("=");
		result[item[0]] = type(decodeURIComponent(item[1]));
	});
	return result;
}

const { id = "JX.519", lang = "fi" } = getJsonFromUrl();

const apiClient = new ApiClient(
	"https://apitest.laji.fi/v0",
	properties.accessToken,
	properties.userToken,
	lang
);
const promise = apiClient.fetch(`/forms/${id}`, {lang, format: "schema"}).then(response => {
	return response.json();
});

promise.then(data => {
	new LajiFormBuilder({...data, lang, apiClient, rootElem: document.querySelector("#app")});
});

