import * as config from "../../../config.json";
import { reduceWith, fetchJSON, translate, dictionarify } from "../../utils";
import queryString from "querystring";
import memoize, { Memoized } from "memoizee";
import MetadataService from "../../services/metadata-service";
import FieldService, { removeTranslations } from "./field-service";
import { FormListing, isLang, Lang, Master, Format } from "../../model";
import ApiClient from "../../api-client";

export class StoreError extends Error {
	status: number;
	storeError: string;
	constructor(code: number, storeError: any) {
		super("Store error");
		// eslint-disable-next-line max-len
		// Explanation https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work
		Object.setPrototypeOf(this, StoreError.prototype);

		this.status = code;
		this.storeError = storeError;
	}
}

// Intended to be used for checked errors, which the controller should return with 422.
export class UnprocessableError extends Error {
	constructor(message: string) {
		super(message);
		// eslint-disable-next-line max-len
		// Explanation https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work
		Object.setPrototypeOf(this, UnprocessableError.prototype);
	}
}

const DEFAULT_LANG = "en";

const lajiStoreFetch = (endpoint: string) => async (url: string, query?: any, options?: any) => 
	 fetchJSON(`${config.lajiStoreBaseUrl}${endpoint}${url}?${queryString.stringify(query)}`, {
		...(options || {}),
		headers: { Authorization: config.lajiStoreAuth, ...(options?.headers || {}) },
	});

export const formFetch = lajiStoreFetch("/form");

const apiClient = new ApiClient(
	config.apiBase,
	config.accessToken,
	undefined,
	DEFAULT_LANG
);

export const exposedProps: Record<keyof FormListing, true> = dictionarify([
	"id", "logo", "title", "description", "shortDescription",
	"supportedLanguage", "category", "collectionID", "options",
	"name"
]);

export const exposedOptions: Record<keyof FormListing["options"], true> = dictionarify([
	"allowExcel",
	"allowTemplate",
	"dataset",
	"emptyOnNoCount",
	"forms",
	"excludeFromGlobalExcel",
	"hasAdmins",
	"prepopulateWithInformalTaxonGroups",
	"restrictAccess",
	"secondaryCopy",
	"sidebarFormLabel",
	"useNamedPlaces",
	"viewerType",
	"disabled",
	"shortTitleFromCollectionName"
]);

const copyWithWhitelist = <T>(obj: T, whitelistDict: Record<keyof T, true>) => {
	const isExposableProperty = (key: string | number | symbol): key is (keyof T) => {
		return !!(whitelistDict as any)[key];
	};
	return Object.keys(obj).reduce<T>((copy: T, key) => {
		if (isExposableProperty(key)) {
			copy[key] = obj[key];
		}
		return copy;
	}, {} as T);
};

export default class MainService {
	cacheStore: (Memoized<any>)[] = [];
	// eslint-disable-next-line @typescript-eslint/ban-types
	cache = <F extends Function>(fn: F, options?: memoize.Options & { clearDepLength?: number }) => {
		const cached = memoize(fn, { promise: true, primitive: true, ...(options || {}) });
		this.cacheStore.push(cached);
		return cached;
	};
	metadataService = new MetadataService(apiClient, DEFAULT_LANG);
	fieldService = new FieldService(apiClient, this.metadataService, DEFAULT_LANG);

	constructor() {
		this.exposeFormListing = this.exposeFormListing.bind(this);
		this.extendBaseForm = this.extendBaseForm.bind(this);
	}

	setLang(lang: Lang) {
		this.metadataService.setLang(lang);
		this.fieldService.setLang(lang);
	}

	private extendBaseForm(form: Master, forms: Master[]) {
		if (!form.baseFormID) {
			return form;
		}

		const baseForm = forms.find(f => f.id === form.baseFormID);
		return baseForm
			? this.fieldService.mapBaseFormFrom(form, baseForm)
			: form;
	}

	private exposeFormListing(form: Master) {
		const exposed = copyWithWhitelist(form as FormListing, exposedProps);
		if (exposed.options) {
			exposed.options = copyWithWhitelist(exposed.options, exposedOptions);
			if (!Object.keys(exposed.options).length) {
				delete exposed.options;
			}
		}
		return  exposed;
	}

	getForms = this.cache(async (lang?: Lang): Promise<FormListing[]> => {
		const remoteForms: Master[] = (await formFetch("/", {page_size: 10000})).member;
		lang && this.setLang(lang);
		return Promise.all(remoteForms.map(form => {
			const {translations} = form;
			return reduceWith<Master, Master[], FormListing>(form, remoteForms, [
				this.extendBaseForm,
				this.exposeFormListing,
				f => f.supportedLanguage
					? f
					: {...f, supportedLanguage: ["en", "fi", "sv"]},
				f => (isLang(lang) && translations && lang in translations)
					? translate(f, (translations[lang] as {[key: string]: string}))
					: f
			]);
		}));
	}, { length: 1 });

	private getRemoteForm = this.cache((id: string) => formFetch(`/${id}`));

	private getFormCache = this.cache((id: string) =>
		this.cache(async (lang?: Lang, format: Format = Format.JSON, expand = true) => {
			const form = await this.getRemoteForm(id);
			lang && this.setLang(lang);
			const isConvertable = (format === Format.Schema || format === Format.JSON && expand); 
			return reduceWith(form, lang, [
				(master, lang) => isConvertable ? this.fieldService.convert(master, format as any, lang) : master,
				(form, lang) => format !== "schema" && isLang(lang) && form.translations && lang in form.translations
					? translate(form, form.translations[lang])
					: form,
				format !== "schema" && isLang(lang) && removeTranslations(lang)
			]);
		}, {length: 3}), {promise: false});

	getForm(id: string, lang?: Lang, format: Format  = Format.JSON, expand = true) {
		return this.getFormCache(id)(lang, format, expand);
	}

	async saveForm(form: Master) {
		const error = await this.fieldService.getError(form);
		if (error) {
			throw error;
		}
		const remoteForm = await formFetch("/", undefined, {
			method: "POST",
			body: JSON.stringify(form),
			headers: {"Content-Type": "application/json"}
		});
		if (remoteForm.status > 400) {
			throw new StoreError(remoteForm.status, remoteForm.error);
		}
		this.getForms.clear();
		return remoteForm;
	}

	async updateForm(id: string, form: Master) {
		const error = await this.fieldService.getError(form);
		if (error) {
			throw error;
		}
		const remoteForm = await formFetch(`/${id}`, undefined, {
			method: "PUT",
			body: JSON.stringify(form),
			headers: {"Content-Type": "application/json"}
		});
		this.getFormCache(id).clear();
		this.getRemoteForm.delete(id);
		this.getForms.clear();
		return remoteForm;
	}

	async deleteForm(id: string) {
		this.getFormCache(id).clear();
		this.getRemoteForm.delete(id);
		this.getForms.clear();
		return formFetch(`/${id}`, undefined, {method: "DELETE"});
	}

	transform(form: Master, lang?: Lang) {
		lang && this.setLang(lang);
		return reduceWith(form, lang, [
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
