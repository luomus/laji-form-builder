import ApiClient from "laji-form/lib/ApiClient";
import { FormListing, Master, Schemas } from "./model";

export default class FormService {
	private apiClient: ApiClient;

	constructor(apiClient: ApiClient) {
		this.apiClient = apiClient;
	}

	getMaster(id: string): Promise<Master> {
		return this.apiClient.fetch(`/forms/${id}`, {lang: "multi", format: "json", expand: false});
	}

	getSchemas(id: string): Promise<Schemas> {
		return this.apiClient.fetch(`/forms/${id}`, {format: "schema"});
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
}
