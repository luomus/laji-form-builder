import fetch from "isomorphic-fetch";
import queryString from "querystring";
import merge from "deepmerge";
import { ApiClientImplementation } from "laji-form/lib/ApiClient";

export default class ApiClient implements ApiClientImplementation {
	BASE_URL: string;
	lang: string;
	accessToken: string;
	constructor(baseUrl: string, accessToken: string, lang = "en") {
		this.BASE_URL =  baseUrl;
		this.lang = lang;
		this.accessToken = accessToken;
	}

	setLang(lang: string) {
		this.lang = lang;
	}

	getBaseQuery() {
		return {access_token: this.accessToken};
	}

	fetch(path: string, query?: any, options?: any) {
		const baseQuery = this.getBaseQuery();
		const queryObject = (typeof query === "object") ? merge(baseQuery, query) : baseQuery;
		return fetch(`${this.BASE_URL}${path}?${queryString.stringify(queryObject)}`, options);
	}

	fetchJSON(path: string, query?: any, options?: any) {
		return this.fetch(path, query, options).then(r => r.json());
	}
}
