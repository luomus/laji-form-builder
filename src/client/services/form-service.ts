import ApiClient from "../../api-client";
import { FormDeleteResult, FormListing, Lang, Master, RemoteMaster, SchemaFormat } from "../../model";


export default class FormService {
	private apiClient: ApiClient;
	private formApiClient?: ApiClient;
	private lang: Lang

	constructor(apiClient: ApiClient,lang: Lang, formApiClient?: ApiClient) {
		this.apiClient = apiClient;
		this.formApiClient = formApiClient;
		this.lang = lang;
	}

	private fetchJSON(path: string, query?: Record<string, unknown>, options?: Record<string, unknown>) {
		return this.formApiClient
			? this.formApiClient.fetchJSON(path, query as any, options)
			: this.apiClient.fetchJSON(`/forms/${path}`, query as any, options);
	}

	getMaster(id: string): Promise<Master> {
		const query: any = {format: "json"};
		if (!this.formApiClient) {
			query.lang = "multi";
		}
		query.expand = false;
		return this.fetchJSON(`/${id}`, query);
	}

	getSchemaFormat(id: string): Promise<SchemaFormat> {
		return this.fetchJSON(`/${id}`, {format: "schema", lang: this.lang});
	}

	update(form: any): Promise<void> {
		return this.fetchJSON(`/${form.id}`, undefined, {method: "PUT", body: JSON.stringify(form), headers: {
			"Content-Type": "application/json"
		}});
	}

	create(form: any): Promise<RemoteMaster> {
		return this.fetchJSON("", undefined, {method: "POST", body: JSON.stringify(form), headers: {
			"Content-Type": "application/json"
		}});
	}

	delete(id: string): Promise<FormDeleteResult> {
		return this.fetchJSON(`/${id}`, undefined, {method: "DELETE"});
	}

	async getForms(): Promise<FormListing[]> {
		const response = (await this.fetchJSON("", undefined));
		return this.formApiClient ? response.forms : response.results;
	}

	masterToSchemaFormat(master: Master): Promise<SchemaFormat> {
		return this.fetchJSON("/transform", {lang: this.lang}, {method: "POST", body: JSON.stringify(master), headers: {
			"Content-Type": "application/json"
		}});
	}

	setLang(lang: Lang) {
		this.lang = lang;
	}
}
