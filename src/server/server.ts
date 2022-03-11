import express from "express";
import queryString from "querystring";
import { lajiStoreBaseUrl, lajiStoreAuth } from "../../properties.json";
import { FormListing, isLang, Master } from "../model";
import { applyTransformations, fetchJSON, translate } from "../utils";
import FieldService, {removeTranslations} from "./services/field-service";
import ApiClient from "laji-form/lib/ApiClient";
import ApiClientImplementation from "../../playground/ApiClientImplementation";
import properties from "../../properties.json";
import MetadataService from "../services/metadata-service";

const DEFAULT_LANG = "en";

const app = express();

const lajiStoreFetch = (endpoint: string) => async (url: string, query?: any, options?: any) => 
	 fetchJSON(`${lajiStoreBaseUrl}${endpoint}${url}?${queryString.stringify(query)}`, {
		headers: { Authorization: lajiStoreAuth },
		...(options || {})
	});

export const formFetch = lajiStoreFetch("/form");

const apiClient = new ApiClient(new ApiClientImplementation(
	"https://apitest.laji.fi/v0",
	properties.accessToken,
	properties.userToken,
	DEFAULT_LANG
), DEFAULT_LANG, {fi: {}, sv: {}, en: {}});
const metadataService = new MetadataService(apiClient, DEFAULT_LANG);
const fieldService = new FieldService(apiClient, metadataService, DEFAULT_LANG);

const dictionarify = (arr: string[]): Record<string, true> => arr.reduce((dict, key) => {
	dict[key] = true;
	return dict;
}, {} as Record<string, true>);

export const exposedProps: Record<keyof FormListing, true> = dictionarify([
	"id", "logo", "title", "description", "shortDescription",
	"supportedLanguage", "category", "collectionID", "options"
]);

function isExposableFormProperty(key: string): key is (keyof FormListing) {
	return !!(exposedProps as any)[key];
}

const exposeFormListing = (form: Master) =>
	Object.keys(form).reduce<FormListing>((copy: FormListing, key) => {
		if (isExposableFormProperty(key)) {
			copy[key] = form[key];
		}
		return copy;
	}, {} as FormListing);

app.get("/", async (req, res) => {
	const {lang} = req.query;

	if (typeof lang === "string" && !isLang(lang)) {
		return res.sendStatus(422);
	}

	const remoteForms: Master[] = (await formFetch("/", {page_size: 10000})).member;
	const forms = await Promise.all(remoteForms.map(form =>  {
		const {translations} = form;
		return applyTransformations(form, undefined, [
			exposeFormListing,
			f => (isLang(lang) && translations && lang in translations)
				? translate(f, translations[lang])
				: f
		]);
	}));
	return res.json({forms});
});

interface IdPathParams {
	id?: string;
}
interface IdQueryParams {
	lang?: string;
	format?: string;
}
app.get<IdPathParams, unknown, unknown, IdQueryParams>("/:id", async (req, res) => {
	const {id} = req.params;
	const {lang, format} = req.query;

	if (typeof lang === "string" && !isLang(lang)) {
		return res.sendStatus(422);
	}

	let form;
	try {
		form = await formFetch(`/${id}`);
	} catch (e) {
		return res.sendStatus(404);
	}

	const _form = await applyTransformations(form, lang, [
		format === "schema" && fieldService.masterToSchemaFormat.bind(fieldService),
		(form, lang) => format !== "schema" && isLang(lang) && form.translations && lang in form.translations
			? translate(form, form.translations[lang])
			: form,
		format !== "schema" && removeTranslations(lang)
	]);

	return res.json(_form);
});

export default app;
