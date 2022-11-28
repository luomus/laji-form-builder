import fetch from "cross-fetch";
import merge from "deepmerge";
import { ApiClientImplementation } from "laji-form/lib/ApiClient";

export default class ApiClient implements ApiClientImplementation {
	BASE_URL: string;
	lang: string;
	accessToken: string;
	personToken?: string;
	constructor(baseUrl: string, accessToken: string, personToken?: string, lang = "en") {
		this.BASE_URL =  baseUrl;
		this.lang = lang;
		this.accessToken = accessToken;
		this.personToken = personToken;
	}

	setLang(lang: string) {
		this.lang = lang;
	}

	getBaseQuery() {
		return {access_token: this.accessToken, personToken: this.personToken};
	}

	fetch(path: string, query?: any, options?: any): Promise<Response> {
		const baseQuery = this.getBaseQuery();
		const queryObject = (typeof query === "object") ? merge(baseQuery, query) : baseQuery;
		return new Promise((resolve, reject) => {
			fetch(
				`${this.BASE_URL}${path}?${new URLSearchParams(queryObject as any).toString()}`,
				options
			).then(response => {
				if (response.status > 400) {
					reject(response);
				} else {
					resolve(response);
				}
			});
		});
	}

	async fetchJSON(path: string, query?: any, options?: any) {
		return (await this.fetch(path, query, options)).json();
	}
}
