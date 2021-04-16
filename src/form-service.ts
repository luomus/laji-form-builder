import ApiClient from "laji-form/lib/ApiClient";
import { Lang } from "./LajiFormBuilder";

export default class FormService {
	private apiClient: ApiClient;
	private lang: Lang;

	constructor(apiClient: ApiClient, lang: Lang) {
		this.apiClient = apiClient;
		this.lang = lang;
	}

	getMaster(id: string) {
		console.log("GET MASSTER");
		return this.apiClient.fetch(`/forms/${id}`, {lang: "multi", format: "json", expand: false});
	}

	getSchemas(id: string) {
		return this.apiClient.fetch(`/forms/${id}`, {lang: this.lang, format: "schema"});
	}
}
