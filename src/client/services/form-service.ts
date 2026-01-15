import ApiClient from "../../api-client";
import { FormDeleteResult, FormListing, Lang, Master, RemoteMaster, SchemaFormat } from "../../model";
import UsesMemoization from "../../services/uses-memoization";

export default class FormService extends UsesMemoization {
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

	getMaster = this.memoize((id: string, signal?: AbortSignal): Promise<Master> => {
		const query: any = {format: "json"};
		if (!this.formApiClient) {
			query.lang = "multi";
		}
		query.expand = false;
		return this.fetchJSON(`/${id}`, query, {signal});
	}, {length: 1});

	private getSchemaFormatCache = this.memoize((id: string) => this.memoize((lang: Lang): Promise<SchemaFormat> =>
		this.fetchJSON(`/${id}`, {format: "schema", lang})
	));

	getSchemaFormat = (id: string) => this.getSchemaFormatCache(id)(this.lang);

	async update(form: any): Promise<RemoteMaster> {
		const remoteForm = await this.fetchJSON(`/${form.id}`, {personToken: this.personToken},
			{method: "PUT", body: form});
		this.getMaster.delete(form.id);
		this.getSchemaFormatCache(form.id).clear();
		return remoteForm;
	}

	create(form: any): Promise<RemoteMaster> {
		return this.fetchJSON("", {personToken: this.personToken},
			{method: "POST", body: form});
	}

	async delete(id: string): Promise<FormDeleteResult> {
		const response = await this.fetchJSON(`/${id}`, {personToken: this.personToken}, {method: "DELETE"});
		this.getMaster.delete(id);
		this.getSchemaFormatCache(id).clear();
		this.getForms.clear();
		return response;
	}

	getForms = this.memoize(async (lang?: Lang, signal?: AbortSignal): Promise<FormListing[]> => {
		const response = (await this.fetchJSON("", lang ? {lang} : undefined, { signal }));
		return this.formApiClient ? response.forms : response.results;
	});

	masterToSchemaFormat(master: Master, signal?: AbortSignal): Promise<SchemaFormat> {
		return this.fetchJSON("/transform", {lang: this.lang, personToken: this.personToken},
			{method: "POST", body: master, signal});
	}

	setLang(lang: Lang) {
		this.lang = lang;
	}
}
