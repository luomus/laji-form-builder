import LajiFormBuilder from "../src/app";
import properties from "../properties.json";
import ApiClient from "./ApiClientImplementation";

import "../src/styles";

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

new LajiFormBuilder({...getJsonFromUrl(), ...properties, rootElem: document.querySelector("#app")});
