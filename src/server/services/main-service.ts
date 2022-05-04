import * as config from "../../../config.json";
import { reduceWith, translate, dictionarify } from "../../utils";
import memoize, { Memoized } from "memoizee";
import MetadataService from "../../services/metadata-service";
import FieldService, { removeTranslations } from "./field-service";
import { FormListing, isLang, Lang, Master, Format } from "../../model";
import ApiClient from "../../api-client";
import StoreService from "./store-service";

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
const addDefaultSupportedLanguage = (f: FormListing) => f.supportedLanguage
	? f
	: {...f, supportedLanguage: ["en", "fi", "sv"]};

const translateSafely = (lang?: Lang) => (f: Master) => (isLang(lang) && f.translations && lang in f.translations)
	? translate(f, (f.translations[lang] as {[key: string]: string}))
	: f;

export default class MainService {
	private cacheStore: (Memoized<any>)[] = [];
	// eslint-disable-next-line @typescript-eslint/ban-types
	private cache = <F extends Function>(fn: F, options?: memoize.Options & { clearDepLength?: number }) => {
		const cached = memoize(fn, { promise: true, primitive: true, ...(options || {}) });
		this.cacheStore.push(cached);
		return cached;
	};
	private metadataService = new MetadataService(apiClient, DEFAULT_LANG);
	private storeService = new StoreService();
	private fieldService = new FieldService(apiClient, this.metadataService, this.storeService, DEFAULT_LANG);

	constructor() {
		this.exposeFormListing = this.exposeFormListing.bind(this);
	}

	setLang(lang: Lang) {
		this.metadataService.setLang(lang);
		this.fieldService.setLang(lang);
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
		lang && this.setLang(lang);
		return Promise.all((await this.storeService.getForms()).map(form => {
			return reduceWith<Master, undefined, FormListing>(form, undefined, [
				this.fieldService.linkMaster,
				translateSafely(lang),
				this.exposeFormListing,
				addDefaultSupportedLanguage
			]);
		}));
	}, { length: 1 });

	private getFormCache = this.cache((id: string) =>
		this.cache(async (lang?: Lang, format: Format = Format.JSON, expand = true) => {
			const form = await this.storeService.getForm(id);
			lang && this.setLang(lang);
			const isConvertable = (format === Format.Schema || format === Format.JSON && expand); 
			return reduceWith(form, lang, [
				(master, lang) => isConvertable ? this.fieldService.convert(master, format as any, lang) : master,
				(form, lang) => format !== "schema" && isLang(lang) && form.translations && lang in form.translations
					? translate(form, form.translations[lang] as Record<string, string>)
					: form,
				format !== "schema" && isLang(lang) && removeTranslations(lang)
			]);
		}, {length: 3}), {promise: false});

	getForm(id: string, lang?: Lang, format: Format = Format.JSON, expand = true) {
		return this.getFormCache(id)(lang, format, expand);
	}

	async saveForm(form: Master) {
		const error = await this.fieldService.getError(form);
		if (error) {
			throw error;
		}
		const remoteForms = this.storeService.createForm(form);
		this.getForms.clear();
		return remoteForms;
	}

	async updateForm(id: string, form: Master) {
		const error = await this.fieldService.getError(form);
		if (error) {
			throw error;
		}
		const remoteForm = this.storeService.updateForm(id, form);
		this.getFormCache(id).clear();
		this.getForms.clear();
		return remoteForm;
	}

	async deleteForm(id: string) {
		const response = await this.storeService.deleteForm(id);
		if (response.affected > 0) {
			this.getFormCache(id).clear();
			this.getForms.clear();
		}
		return response;
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
		this.storeService.flush();
		this.metadataService.flush();
	}
}
