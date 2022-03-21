import ApiClient from "laji-form/lib/ApiClient";
import ApiClientImplementation from "../app/ApiClientImplementation";
import config from "../../../config.json";
import { applyTransformations, fetchJSON, translate } from "../../utils";
import queryString from "querystring";
import memoize, { Memoized } from "memoizee";
import MetadataService from "../../services/metadata-service";
import FieldService, { removeTranslations } from "./field-service";
import { FormListing, isLang, Lang, Master } from "../../model";

const DEFAULT_LANG = "en";

const lajiStoreFetch = (endpoint: string) => async (url: string, query?: any, options?: any) => 
	 fetchJSON(`${config.lajiStoreBaseUrl}${endpoint}${url}?${queryString.stringify(query)}`, {
		...(options || {}),
		headers: { Authorization: config.lajiStoreAuth, ...(options?.headers || {}) },
	});

export const formFetch = lajiStoreFetch("/form");

const apiClient = new ApiClient(new ApiClientImplementation(
	config.apiBase,
	config.accessToken,
	config.userToken,
	DEFAULT_LANG
), DEFAULT_LANG, {fi: {}, sv: {}, en: {}});

const dictionarify = (arr: string[]): Record<string, true> => arr.reduce((dict, key) => {
	dict[key] = true;
	return dict;
}, {} as Record<string, true>);

export const exposedProps: Record<keyof FormListing, true> = dictionarify([
	"id", "logo", "title", "description", "shortDescription",
	"supportedLanguage", "category", "collectionID", "options"
]);

export default class MainService {
	cacheStore: (Memoized<any>)[] = [];
	// eslint-disable-next-line @typescript-eslint/ban-types
	cache = <F extends Function>(fn: F, options?: memoize.Options) => {
		const cached = memoize(fn, { promise: true, primitive: true, ...(options || {}) });
		this.cacheStore.push(cached);
		return cached;
	};
	metadataService = new MetadataService(apiClient, DEFAULT_LANG);
	fieldService = new FieldService(apiClient, this.metadataService, DEFAULT_LANG);

	constructor() {
		this.exposeFormListing = this.exposeFormListing.bind(this);
	}

	isExposableFormListingProperty(key: string): key is (keyof FormListing) {
		return !!(exposedProps as any)[key];
	}

	private exposeFormListing(form: Master) {
		return Object.keys(form).reduce<FormListing>((copy: FormListing, key) => {
			if (this.isExposableFormListingProperty(key)) {
				copy[key] = form[key];
			}
			return copy;
		}, {} as FormListing);
	}

	getForms = this.cache(async (lang?: Lang): Promise<FormListing[]> => {
		const remoteForms: Master[] = (await formFetch("/", {page_size: 10000})).member;
		return Promise.all(remoteForms.map(form => {
			const {translations} = form;
			return applyTransformations<Master, undefined, FormListing>(form, undefined, [
				this.exposeFormListing,
				f => (isLang(lang) && translations && lang in translations)
					? translate(f, translations[lang])
					: f
			]);
		}));
	}, { length: 1 });

	private getRemoteForm = this.cache((id: string) => formFetch(`/${id}`));

	getForm = this.cache(async (id: string, lang?: Lang, format: "json" | "schema" = "json") => {
		const form = await this.getRemoteForm(id);
		return applyTransformations(form, lang, [
			format === "schema" && this.fieldService.masterToSchemaFormat,
			(form, lang) => format !== "schema" && isLang(lang) && form.translations && lang in form.translations
				? translate(form, form.translations[lang])
				: form,
			format !== "schema" && isLang(lang) && removeTranslations(lang)
		]);
	}, { length: 3 });

	async saveForm(form: Master) {
		const remoteForm = await formFetch("/", undefined, {
			method: "POST",
			body: JSON.stringify(form),
			headers: {"Content-Type": "application/json"}
		});
		this.getForms.clear();
		return remoteForm;
	}

	async updateForm(id: string, form: Master) {
		const remoteForm = await formFetch(`/${id}`, undefined, {
			method: "PUT",
			body: JSON.stringify(form),
			headers: {"Content-Type": "application/json"}
		});
		this.getForm.delete(id);
		this.getRemoteForm.delete(id);
		this.getForms.clear();
		return remoteForm;
	}

	async deleteForm(id: string) {
		this.getForm.delete(id);
		this.getRemoteForm.delete(id);
		this.getForms.clear();
		return formFetch(`/${id}`, undefined, {method: "DELETE"});
	}

	transform(form: Master, lang?: Lang) {
		 return applyTransformations(form, lang, [
			this.fieldService.masterToSchemaFormat,
			isLang(lang) && removeTranslations(lang)
		 ]);
	}

	flush() {
		this.cacheStore.forEach(c => c.clear());
		this.cacheStore = [];
		this.metadataService.flush();
	}
}
