import ApiClient from "laji-form/lib/ApiClient";

export default class FormService {
	private apiClient: ApiClient;

	constructor(apiClient: ApiClient) {
		this.apiClient = apiClient;
	}

	getMaster(id: string) {
		return this.apiClient.fetch(`/forms/${id}`, {lang: "multi", format: "json", expand: false});
	}

	getSchemas(id: string) {
		return this.apiClient.fetch(`/forms/${id}`, {format: "schema"});
	}

	update(form: any) {
		return this.apiClient.fetch(`/forms/${form.id}`, undefined, {method: "PUT", body: JSON.stringify(form)});
	}
}
