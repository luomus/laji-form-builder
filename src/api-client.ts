import fetch from "cross-fetch";
import { ApiClientImplementation as ApiClientAbstract } from "@luomus/laji-form/lib/ApiClient";

export default class ApiClient {
	apiClient: ApiClientAbstract;
	lang: string;

	constructor(apiClient: ApiClientAbstract, lang = "en") {
		this.apiClient = apiClient;
		this.lang = lang;
	}

	setLang(lang: string) {
		this.lang = lang;
	}

	async fetch(path: string, query?: any, options?: any): Promise<Response> {
		const response = await this.apiClient.fetch(path, query, options);
		if (response.status >= 400) {
			throw response;
		}
		return response;
	}

	async fetchJSON(path: string, query?: any, options?: any) {
		const res = (await this.fetch(path, query, options));
		return res.json();
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

	fetch(path: string, query: any = {}, options?: any): Promise<Response> {
		options = {
			...(options|| {}),
			headers: {
				...(options?.headers || {}),
				"API-Version": 1,
				Authorization: `Bearer ${this.accessToken}`,
			}
		};
		if (options.body) {
			if (typeof options.body !== "string") {
				options.body = JSON.stringify(options.body);
			}
			options.headers = {
				...(options?.headers || {}),
				"Content-Type": "application/json"
			};
		}
		if (this.personToken) {
			options.headers["Person-Token"] = this.personToken;
		}
		return fetch(
			`${this.BASE_URL}${path}?${new URLSearchParams(query as any).toString()}`,
			options
		);
	}
}
