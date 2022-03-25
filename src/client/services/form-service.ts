import ApiClient from "laji-form/lib/ApiClient";
import { FormDeleteResult, FormListing, Lang, Master, SchemaFormat } from "../../model";

export default class FormService {
	private apiClient: ApiClient;
	private formApiClient?: ApiClient;
	private lang: Lang

	constructor(apiClient: ApiClient,lang: Lang, formApiClient?: ApiClient) {
		this.apiClient = apiClient;
		this.formApiClient = formApiClient;
		this.lang = lang;
	}

	private fetch(path: string, query?: Record<string, unknown>, options?: Record<string, unknown>) {
		return this.formApiClient
			? this.formApiClient.fetch(path, query, options)
			: this.apiClient.fetch(`/forms/${path}`, query, options);
	}

	getMaster(id: string): Promise<Master> {
		const query: any = {format: "json", lang: undefined};
		if (!this.formApiClient) {
			query.lang = "multi";
			query.expand = false;
		}
		return this.fetch(`/${id}`, query);
	}

	getSchemaFormat(id: string): Promise<SchemaFormat> {
		return this.fetch(`/${id}`, {format: "schema", lang: this.lang});
	}

	update(form: any): Promise<void> {
		return this.fetch(`/${form.id}`, undefined, {method: "PUT", body: JSON.stringify(form)});
	}

	create(form: any): Promise<Master> {
		return this.fetch("", undefined, {method: "POST", body: JSON.stringify(form)});
	}

	delete(id: string): Promise<FormDeleteResult> {
		return this.fetch(`/${id}`, undefined, {method: "DELETE"});
	}

	async getForms(): Promise<FormListing[]> {
		const response = (await this.fetch("", undefined));
		return this.formApiClient ? response.forms : response.results;
	}

	masterToSchemaFormat(master: Master): Promise<SchemaFormat> {
		return this.fetch("/transform", undefined, {method: "POST", body: JSON.stringify(master), headers: {
			"Content-Type": "application/json"
		}});
	}

	setLang(lang: Lang) {
		this.lang = lang;
	}
}
