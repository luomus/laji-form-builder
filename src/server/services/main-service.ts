import * as config from "../../../config.json";
import { reduceWith, translate, dictionarify, bypass } from "../../utils";
import MetadataService from "../../services/metadata-service";
import FieldService, { addEmptyOptions, removeTranslations } from "./field-service";
import { FormListing, isLang, Lang, Master, Format, SupportedFormat, RemoteMaster, FormOptions } from "../../model";
import ApiClient, { ApiClientImplementation } from "../../api-client";
import StoreService from "./store-service";
import UsesMemoization from "../../services/uses-memoization";
import { CronJob } from "cron";

/**
 * Intended to be used for checked errors, which the controller should return with 422.
 **/
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
	new ApiClientImplementation(
		config.apiBase,
		config.accessToken
	),
	DEFAULT_LANG
);

export const hiddenListedProps = dictionarify([
	"fields", "translations", "uiSchema"
] as (keyof Master)[]);

const copyWithBlacklist = <T extends Record<string, unknown>>(obj: T, blacklistDict: Record<keyof T, true>) => {
	const isExposableProperty = (key: string | number | symbol): key is (keyof T) => {
		return !(blacklistDict as any)[key];
	};
	return Object.keys(obj).reduce<T>((copy: T, key: keyof T) => {
		if (isExposableProperty(key)) {
			copy[key] = obj[key];
		}
		return copy;
	}, {} as T);
};

const addDefaultSupportedLanguage = (f: FormListing): FormListing => f.supportedLanguage
	? f
	: {...f, supportedLanguage: ["en", "fi", "sv"]};

const translateSafely = (lang?: Lang) => (f: Master) => (isLang(lang) && f.translations && lang in f.translations)
	? translate(f, (f.translations[lang] as {[key: string]: string}))
	: f;


const exposeFormListing = (form: Master & { options: FormOptions } ) => {
	return copyWithBlacklist(form, hiddenListedProps);
};

const exposeInheritance = (form: Master) => {
	return (expandedForm: Master): Master => {
		return { ...expandedForm, baseFormID: form.baseFormID, fieldsFormID: form.fieldsFormID };
	};
};

export default class MainService extends UsesMemoization {
	private metadataService = new MetadataService(apiClient, DEFAULT_LANG);
	private storeService = new StoreService();
	private fieldService = new FieldService(apiClient, this.metadataService, this.storeService, DEFAULT_LANG);

	constructor() {
		super();
		this.flush = this.flush.bind(this);

		// Flush every day at 4am.
		const job = new CronJob("0 4 * * *", this.flush);
		job.start();
		this.warmup();
	}

	setLang(lang: Lang) {
		this.metadataService.setLang(lang);
		this.fieldService.setLang(lang);
	}

	getForms = this.memoize(async (lang?: Lang): Promise<FormListing[]> => {
		lang && this.setLang(lang);
		return Promise.all((await this.storeService.getForms()).map(form => {
			const result = reduceWith(
				form,
				undefined,
				this.fieldService.expand,
				translateSafely(lang),
				addEmptyOptions,
				exposeFormListing,
				exposeInheritance(form),
				addDefaultSupportedLanguage,
			);
			return result;
		}));
	}, { length: 1 });

	/*
	 * We use the curried syntax (id)(lang, format, expand) so that the cache can be busted by id.
	 */
	private getFormCache = this.memoize((id: string) =>
		this.memoize(async (lang?: Lang, format: Format = Format.JSON, expand = true) => {
			const form = await this.storeService.getForm(id);
			lang && this.setLang(lang);
			const isConvertable = (
				format === Format.Schema
				|| format === Format.JSON && expand
			);

			return reduceWith(form, lang,
				(master, lang): RemoteMaster | Promise<SupportedFormat> => isConvertable
					? this.fieldService.convert(master, format as any, lang)
					: master,
				(form, lang) =>
					format === Format.JSON && isLang(lang) && form.translations && lang in form.translations
						? translate(form, form.translations[lang] as Record<string, string>)
						: form,
				format === Format.JSON ? removeTranslations(lang) : bypass
			);
		}, {length: 3}), {promise: false});

	getForm(id: string, lang?: Lang, format: Format = Format.JSON, expand = true) {
		return this.getFormCache(id)(lang, format, expand);
	}

	async saveForm(form: Master) {
		const error = await this.fieldService.validate(form);
		if (error) {
			throw error;
		}
		const remoteForms = this.storeService.createForm(form);
		this.getForms.clear();
		return remoteForms;
	}

	async updateForm(id: string, form: Master) {
		const error = await this.fieldService.validate(form);
		if (error) {
			throw error;
		}
		const remoteForm = this.storeService.updateForm(id, form);
		(await this.getExtendingForms(id)).forEach(id => {
			this.getFormCache(id).clear();
		});
		this.getFormCache(id).clear();
		this.getForms.clear();
		this.storeService.flush();
		return remoteForm;
	}

	async deleteForm(id: string) {
		const extendingForms = await this.getExtendingForms(id);
		if (extendingForms.length) {
			// eslint-disable-next-line max-len
			throw new UnprocessableError(`Can't delete form that is extended by other forms. The form ${id} is extended by forms ${extendingForms.join(", ")}`);
		}
		const response = await this.storeService.deleteForm(id);
		if (response.affected > 0) {
			this.getFormCache(id).clear();
			this.getForms.clear();
		}
		return response;
	}

	private async getExtendingForms(id: string) {
		const forms = (await this.storeService.getForms()).filter(f => f.baseFormID || f.fieldsFormID);

		const getList = async (id: string) => {
			return forms.reduce<Promise<string[]>>(async (_list, f) => {
				const list = await _list;
				if (f.baseFormID === id || f.fieldsFormID === id) {
					list.push(f.id);
					list.push(...(await getList(f.id)));
				}
				return list;
			}, Promise.resolve([]));
		};

		return getList(id);
	}

	transform(form: Master, lang?: Lang) {
		lang && this.setLang(lang);
		return reduceWith(
			form,
			lang, 
			this.fieldService.masterToSchemaFormat,
			removeTranslations(lang)
		);
	}

	flush() {
		super.flush();
		this.storeService.flush();
		this.metadataService.flush();
		this.warmup();
	}

	async warmup() {
		const warmupForms = async () => {
			const forms = await this.getForms();
			for (const f of forms) {
				await this.getForm(f.id, undefined, Format.Schema);
			}
		};

		await this.metadataService.getAllRanges();
		await warmupForms();
	}
}
