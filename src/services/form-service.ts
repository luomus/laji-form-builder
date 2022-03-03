import ApiClient from "laji-form/lib/ApiClient";
import { FormListing, Lang, Master, SchemaFormat } from "../model";

export default class FormService {
	private apiClient: ApiClient;
	private lang: Lang

	constructor(apiClient: ApiClient, lang: Lang) {
		this.apiClient = apiClient;
		this.lang = lang;
	}

	getMaster(id: string): Promise<Master> {
		return this.apiClient.fetch(`/forms/${id}`, {lang: "multi", format: "json", expand: false});
	}

	getSchemaFormat(id: string): Promise<SchemaFormat> {
		return this.apiClient.fetch(`/forms/${id}`, {format: "schema", lang: this.lang});
	}

	update(form: any): Promise<void> {
		return this.apiClient.fetch(`/forms/${form.id}`, undefined, {method: "PUT", body: JSON.stringify(form)});
	}

	create(form: any): Promise<Master> {
		return this.apiClient.fetch("/forms", undefined, {method: "POST", body: JSON.stringify(form)});
	}

	async getForms(): Promise<FormListing[]> {
		return (await this.apiClient.fetch("/forms", undefined)).results;
	}

	setLang(lang: Lang) {
		this.lang = lang;
	}
}
