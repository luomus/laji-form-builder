import fetch from "cross-fetch";
import { ApiClientImplementation as ApiClientAbstract } from "laji-form/lib/ApiClient";

export default class ApiClient {
	apiClient: ApiClientImplementation;
	lang: string;

	constructor(apiClient: ApiClientImplementation, lang = "en") {
		this.apiClient = apiClient;
		this.lang = lang;
	}

	setLang(lang: string) {
		this.lang = lang;
	}

	fetch(path: string, query?: any, options?: any): Promise<Response> {
		return new Promise((resolve, reject) => {
			this.apiClient.fetch(path, query, options).then(response => {
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

export class ApiClientImplementation implements ApiClientAbstract {
	BASE_URL: string;
	accessToken: string;
	personToken?: string;
	constructor(baseUrl: string, accessToken: string, personToken?: string) {
		this.BASE_URL =  baseUrl;
		this.accessToken = accessToken;
		this.personToken = personToken;
	}

	getBaseQuery() {
		return {access_token: this.accessToken, personToken: this.personToken};
	}

	fetch(path: string, query?: any, options?: any): Promise<Response> {
		const baseQuery = this.getBaseQuery();
		const queryObject = (typeof query === "object") ? {...baseQuery, ...query} : baseQuery;
		return fetch(
			`${this.BASE_URL}${path}?${new URLSearchParams(queryObject as any).toString()}`,
			options
		);
	}
}
