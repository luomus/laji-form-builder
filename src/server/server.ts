import express from "express";
import queryString from "querystring";
import { lajiStoreBaseUrl, lajiStoreAuth } from "../../properties.json";
import { FormListing, isLang, Lang, Master } from "../model";
import { applyTransformations, fetchJSON, translate } from "../utils";

const app = express();

const lajiStoreFetch = (endpoint: string) => async (url: string, query?: any, options?: any) => 
	 fetchJSON(`${lajiStoreBaseUrl}${endpoint}${url}?${queryString.stringify(query)}`, {
		headers: { Authorization: lajiStoreAuth },
		...(options || {})
	});

export const formFetch = lajiStoreFetch("/form");

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
		res.sendStatus(422);
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
	res.json({forms});
});

app.get("/:id", async (req, res) => {
	const {id} = req.params;

	let form;
	try {
		form = await formFetch(`/${id}`);
	} catch (e) {
		res.sendStatus(404);
	}
	res.json(form);
});

export default app;
