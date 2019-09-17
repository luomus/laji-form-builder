import fetch from "isomorphic-fetch";
import queryString from "querystring";
import merge from "deepmerge";

export default class ApiClient {
	constructor(baseUrl, accessToken, userToken, lang = "en") {
		this.BASE_URL =  baseUrl;
		this.lang = lang;
		this.accessToken = accessToken;
		this.userToken = userToken;
	}

	getBaseQuery() {
		return {access_token: this.accessToken, personToken: this.userToken};
	}

	fetch(path, query, options) {
		const baseQuery = this.getBaseQuery();
		const queryObject = (typeof query == "object") ? merge(baseQuery, query) : baseQuery;
		return fetch(`${this.BASE_URL}${path}?${queryString.stringify(queryObject)}`, options);
	}
}
