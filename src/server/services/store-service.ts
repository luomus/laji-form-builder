import { Master, RemoteMaster } from "../../model";
import { fetchJSON, dictionarifyByKey, isObject } from "../../utils";
import * as config from "../../../config.json";
import HasCache from "../../services/has-cache";

export class StoreError extends Error {
	status: number;
	storeError: string;
	constructor(error: StoreErrorModel) {
		super("Store error");
		// eslint-disable-next-line max-len
		// Explanation https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work
		Object.setPrototypeOf(this, StoreError.prototype);

		this.status = error.status || error.statusCode || 500;
		this.storeError = error.error;
	}
}

const lajiStoreFetch = (endpoint: string) => async <T>(url: string, query?: any, options?: any) => 
	 // eslint-disable-next-line max-len
	 fetchJSON<T | StoreErrorModel>(`${config.lajiStoreBaseUrl}${endpoint}${url}?${new URLSearchParams(query).toString()}`, {
		...(options || {}),
		headers: { Authorization: config.lajiStoreAuth, ...(options?.headers || {}) },
	});

export const formFetch = lajiStoreFetch("/form");

type DeleteResponse = {
	affected: number;
}

type ListResponse<T> = {
	member: T;
}

type StoreErrorModel = {
	status?: number;
	statusCode?: number;
	error: string;
}

type MaybeStoreError<T> = T | StoreErrorModel

const isStoreError = (response: any): response is StoreErrorModel => 
	isObject(response) && [response.status, response.statusCode].some(c => c > 400);

export default class StoreService extends HasCache {
	private forms: Record<string, RemoteMaster> = {};

	getForms = this.cache(async (): Promise<RemoteMaster[]> => {
		const response = await formFetch<ListResponse<RemoteMaster[]>>("/", {page_size: 10000});
		if (isStoreError(response)) {
			throw new StoreError(response);
		}
		const remoteForms = response.member;
		this.forms = dictionarifyByKey(remoteForms, "id");
		return remoteForms;
	});

	getForm = this.cache(async (id: string) => {
		const response = await (this.forms?.[id]
			? Promise.resolve(this.forms[id])
			: formFetch<RemoteMaster>(`/${id}`));
		if (isStoreError(response)) {
			throw new StoreError(response);
		}
		this.forms[id] = response;
		return response;
	});

	async createForm(form: Master) {
		const response = await formFetch<MaybeStoreError<RemoteMaster>>("/", undefined, {
			method: "POST",
			body: JSON.stringify(form),
			headers: {"Content-Type": "application/json"}
		});
		if (isStoreError(response)) {
			throw new StoreError(response);
		}
		this.getForms.clear();
		return response;
	}

	async updateForm(id: string, form: Master) {
		const response = await formFetch<RemoteMaster>(`/${id}`, undefined, {
			method: "PUT",
			body: JSON.stringify(form),
			headers: {"Content-Type": "application/json"}
		});
		if (isStoreError(response)) {
			throw new StoreError(response);
		}
		this.getForm.delete(id);
		delete this.forms[id];
		this.getForms.clear();
		return response;
	}

	async deleteForm(id: string) {
		const response = await formFetch<DeleteResponse>(`/${id}`, undefined, {method: "DELETE"});
		if (isStoreError(response)) {
			throw new StoreError(response);
		}
		this.getForm.delete(id);
		delete this.forms[id];
		this.getForms.clear();
		return response;
	}

	flush(id?: string) {
		if (id) {
			delete this.forms[id];
			this.getForm.delete(id);
		} else {
			this.forms = {};
			super.flush();
		}
	}
}
