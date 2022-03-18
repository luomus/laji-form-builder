import express, { RequestHandler, Response } from "express";
import bodyParser from "body-parser";
import queryString from "querystring";
import path from "path";
import { FormListing, isLang, Lang, Master } from "../model";
import { applyTransformations, fetchJSON, translate } from "../utils";
import FieldService, { removeTranslations } from "./services/field-service";
import ApiClient from "laji-form/lib/ApiClient";
import ApiClientImplementation from "./app/ApiClientImplementation";
import config from "../../config.json";
import MetadataService from "../services/metadata-service";
import memoize, { Memoized } from "memoizee";

const DEFAULT_LANG = "en";

let cacheStore: (Memoized<any>)[] = [];
// eslint-disable-next-line @typescript-eslint/ban-types
const cache = <F extends Function>(fn: F, options?: memoize.Options) => {
	const cached = memoize(fn, { promise: true, primitive: true, ...(options || {}) });
	cacheStore.push(cached);
	return cached;
};

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

function isExposableFormListingProperty(key: string): key is (keyof FormListing) {
	return !!(exposedProps as any)[key];
}

const exposeFormListing = (form: Master) =>
	Object.keys(form).reduce<FormListing>((copy: FormListing, key) => {
		if (isExposableFormListingProperty(key)) {
			copy[key] = form[key];
		}
		return copy;
	}, {} as FormListing);

const error = (res: Response, status: number, detail: string) => res.status(status).json({
	status,
	detail
});

const langCheckMiddleWare: RequestHandler = (req, res, next) => {
	const {lang} = req.query;
	if (typeof lang === "string" && !isLang(lang)) {
		return error(res, 422, "Query param lang should be one of 'fi', 'sv' or 'en'");
	}
	return next();
};

const app = express();

app.use("/api", bodyParser.json({limit: "1MB"}));

app.get("/api/flush", async (req, res) => {
	cacheStore.forEach(c => c.clear());
	cacheStore = [];
	metadataService.flush();
	return res.json({flush: "ok"});
});

const getForms = cache(async (lang?: Lang): Promise<FormListing[]> => {
	const remoteForms: Master[] = (await formFetch("/", {page_size: 10000})).member;
	return Promise.all(remoteForms.map(form => {
		const {translations} = form;
		return applyTransformations<Master, undefined, FormListing>(form, undefined, [
			exposeFormListing,
			f => (isLang(lang) && translations && lang in translations)
				? translate(f, translations[lang])
				: f
		]);
	}));
}, { length: 1 });

app.get("/api", langCheckMiddleWare, async (req, res) => {
	const {lang} = req.query;
	return res.json({forms: await getForms(lang as (Lang | undefined))});
});

const getRemoteForm = cache((id: string) => formFetch(`/${id}`));

const getForm = cache(async (id: string, lang?: Lang, format: "json" | "schema" = "json") => {
	const form = await getRemoteForm(id);
	return applyTransformations(form, lang, [
		format === "schema" && fieldService.masterToSchemaFormat,
		(form, lang) => format !== "schema" && isLang(lang) && form.translations && lang in form.translations
			? translate(form, form.translations[lang])
			: form,
		format !== "schema" && isLang(lang) && removeTranslations(lang)
	]);
}, { length: 3 });

app.get("/api/:id", langCheckMiddleWare, async (req, res) => {
	const {id} = req.params;
	const {lang, format = "json"} = req.query;
	if (format !== "schema" && format !== "json") {
		return error(res, 422, "Query param format should be one of 'json', 'schema'");
	}
	return res.json(await getForm(id, lang as (Lang | undefined), format));
});

app.post("/api", async (req, res) => {
	if (req.body.id) {
		return error(res, 422, "Shouldn't specify id when creating a new form entry");
	}

	const form = await formFetch("/", undefined, {
		method: "POST",
		body: JSON.stringify(req.body),
		headers: {"Content-Type": "application/json"}
	});
	getForms.clear();
	return res.json(form);
});

app.put("/api/:id", async (req, res) => {
	const {id} = req.params;
	const form = await formFetch(`/${id}`, undefined, {
		method: "PUT",
		body: JSON.stringify(req.body),
		headers: {"Content-Type": "application/json"}
	});
	getForm.delete(id);
	getRemoteForm.delete(id);
	getForms.clear();
	res.json(form);
});

app.delete("/api/:id", async (req, res) => {
	const {id} = req.params;
	getForm.delete(id);
	getRemoteForm.delete(id);
	getForms.clear();
	return res.json(await formFetch(`/${id}`, undefined, {method: "DELETE"}));
});

app.post("/api/transform", langCheckMiddleWare, async (req, res) => {
	const {lang} = req.query;
	return res.json(await applyTransformations(req.body, lang, [
		fieldService.masterToSchemaFormat,
		isLang(lang) && removeTranslations(lang)
	]));
});

app.get("/*", async (req, res, next) => {
	// '/static' and webpack must be manually ignored here because it can't be routed before
	// this route, since dev/prod setups need to handle the routes after the main server.ts
	if (req.url.startsWith("/static") || req.url.startsWith("/__webpack")) {
		return next();
	}
	res.sendFile(path.join(__dirname, "app", "index.html"));
});

export default app;
