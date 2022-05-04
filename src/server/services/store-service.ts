import queryString from "querystring";
import memoize, { Memoized } from "memoizee";
import { Master, RemoteMaster } from "../../model";
import { fetchJSON, dictionarifyByKey, isObject } from "../../utils";
import * as config from "../../../config.json";

export class StoreError extends Error {
	status: number;
	storeError: string;
	constructor(error: StoreErrorModel) {
		super("Store error");
		// eslint-disable-next-line max-len
		// Explanation https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work
		Object.setPrototypeOf(this, StoreError.prototype);

		this.status = error.status;
		this.storeError = error.error;
	}
}

const lajiStoreFetch = (endpoint: string) => async <T>(url: string, query?: any, options?: any) => 
	 fetchJSON<T | StoreErrorModel>(`${config.lajiStoreBaseUrl}${endpoint}${url}?${queryString.stringify(query)}`, {
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
	status: number;
	error: string;
}

type MaybeStoreError<T> = T | StoreErrorModel

const isStoreError = (response: any): response is StoreErrorModel => 
	isObject(response) && response.status > 400;

export default class StoreService {
	private forms: Record<string, RemoteMaster>;
	private cacheStore: (Memoized<any>)[] = [];
	// eslint-disable-next-line @typescript-eslint/ban-types
	private cache = <F extends Function>(fn: F, options?: memoize.Options & { clearDepLength?: number }) => {
		const cached = memoize(fn, { promise: true, primitive: true, ...(options || {}) });
		this.cacheStore.push(cached);
		return cached;
	};

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
		this.getForms.clear();
		return response;
	}

	async deleteForm(id: string) {
		const response = await formFetch<DeleteResponse>(`/${id}`, undefined, {method: "DELETE"});
		if (isStoreError(response)) {
			throw new StoreError(response);
		}
		this.getForm.delete(id);
		this.getForms.clear();
		return response;
	}

	flush() {
		this.cacheStore.forEach(c => c.clear());
		this.cacheStore = [];
	}
}
