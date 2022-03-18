import express, { RequestHandler, Response } from "express";
import bodyParser from "body-parser";
import queryString from "querystring";
import path from "path";
import { lajiStoreBaseUrl, lajiStoreAuth } from "../../properties.json";
import { FormListing, isLang, Master } from "../model";
import { applyTransformations, fetchJSON, isObject, translate } from "../utils";
import FieldService, {removeTranslations} from "./services/field-service";
import ApiClient from "laji-form/lib/ApiClient";
import ApiClientImplementation from "./app/ApiClientImplementation";
import properties from "../../properties.json";
import MetadataService from "../services/metadata-service";

const DEFAULT_LANG = "en";

const lajiStoreFetch = (endpoint: string) => async (url: string, query?: any, options?: any) => 
	 fetchJSON(`${lajiStoreBaseUrl}${endpoint}${url}?${queryString.stringify(query)}`, {
		...(options || {}),
		headers: { Authorization: lajiStoreAuth, ...(options?.headers || {}) },
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

app.get("/api", langCheckMiddleWare, async (req, res) => {
	const {lang} = req.query;

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

app.get("/api/:id", langCheckMiddleWare, async (req, res) => {
	const {id} = req.params;
	const {lang, format} = req.query;

	let form;
	try {
		form = await formFetch(`/${id}`);
	} catch (e) {
		return error(res, 404, `Form not found by id ${id}`);
	}

	return res.json(await applyTransformations(form, lang, [
		format === "schema" && fieldService.masterToSchemaFormat,
		(form, lang) => format !== "schema" && isLang(lang) && form.translations && lang in form.translations
			? translate(form, form.translations[lang])
			: form,
		format !== "schema" && isLang(lang) && removeTranslations(lang)
	]));
});

app.post("/api", async (req, res) => {
	if (req.body.id) {
		return error(res, 422, "Shouldn't specify id when creating a new form entry");
	}
	return res.json(await formFetch("/", undefined, {
		method: "POST",
		body: JSON.stringify(req.body),
		headers: {"Content-Type": "application/json"}
	}))
});

app.put("/api/:id", async (req, res) => {
	res.json(await formFetch(`/${req.params.id}`, undefined, {
		method: "PUT",
		body: JSON.stringify(req.body),
		headers: {"Content-Type": "application/json"}
	}));
});

app.delete("/api/:id", async (req, res) => {
	return res.json(await formFetch(`/${req.params.id}`, undefined, {method: "DELETE"}));
});

app.post("/api/transform", langCheckMiddleWare, async (req, res) => {
	const {lang} = req.query;
	return res.json(await applyTransformations(req.body, lang, [
		fieldService.masterToSchemaFormat,
		isLang(lang) && removeTranslations(lang)
	]));
});

app.get("/*", async (req, res, next) => {
	// '/static' and webpack must be manually ignored here becayse it can't be routed before
	// this route, since dev/prod setups need to handle the routes after the main server.ts
	if (req.url.startsWith("/static") || req.url.startsWith("/__webpack")) {
		return next();
	}
	res.sendFile(path.join(__dirname, "app", "index.html"));
});

export default app;
