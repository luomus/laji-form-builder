import ApiClient from "../../api-client";
import { FormDeleteResult, FormListing, Lang, Master, RemoteMaster, SchemaFormat } from "../../model";
import HasCache from "../../services/has-cache";


export default class FormService extends HasCache {
	private apiClient: ApiClient;
	private formApiClient?: ApiClient;
	private lang: Lang
	private personToken?: string;

	constructor(apiClient: ApiClient,lang: Lang, formApiClient?: ApiClient, personToken?: string) {
		super();
		this.apiClient = apiClient;
		this.formApiClient = formApiClient;
		this.lang = lang;
		this.personToken = personToken;
	}

	private fetchJSON(path: string, query?: Record<string, unknown>, options?: Record<string, unknown>) {
		return this.formApiClient
			? this.formApiClient.fetchJSON(path, query as any, options)
			: this.apiClient.fetchJSON(`/forms/${path}`, query as any, options);
	}

	getMaster = this.cache((id: string, signal?: AbortSignal): Promise<Master> => {
		const query: any = {format: "json"};
		if (!this.formApiClient) {
			query.lang = "multi";
		}
		query.expand = false;
		return this.fetchJSON(`/${id}`, query, {signal});
	}, {length: 1});

	private getSchemaFormatCache = this.cache((id: string) => this.cache((lang: Lang): Promise<SchemaFormat> =>
		this.fetchJSON(`/${id}`, {format: "schema", lang})
	));

	getSchemaFormat = (id: string) => this.getSchemaFormatCache(id)(this.lang);

	async update(form: any): Promise<RemoteMaster> {
		const remoteForm = await this.fetchJSON(`/${form.id}`, {personToken: this.personToken},
			{method: "PUT", body: JSON.stringify(form), headers: {
				"Content-Type": "application/json"
			}});
		this.getMaster.delete(form.id);
		this.getSchemaFormatCache(form.id).clear();
		return remoteForm;
	}

	create(form: any): Promise<RemoteMaster> {
		return this.fetchJSON("", {personToken: this.personToken},
			{method: "POST", body: JSON.stringify(form), headers: {
				"Content-Type": "application/json"
			}});
	}

	async delete(id: string): Promise<FormDeleteResult> {
		const response = await this.fetchJSON(`/${id}`, {personToken: this.personToken}, {method: "DELETE"});
		this.getMaster.delete(id);
		this.getSchemaFormatCache(id).clear();
		this.getForms.clear();
		return response;
	}

	getForms = this.cache(async (): Promise<FormListing[]> => {
		const response = (await this.fetchJSON("", undefined));
		return this.formApiClient ? response.forms : response.results;
	});

	masterToSchemaFormat(master: Master, signal?: AbortSignal): Promise<SchemaFormat> {
		return this.fetchJSON("/transform", {lang: this.lang, personToken: this.personToken},
			{method: "POST", body: JSON.stringify(master), headers: {
				"Content-Type": "application/json"
			}, signal});
	}

	setLang(lang: Lang) {
		this.lang = lang;
	}
}
