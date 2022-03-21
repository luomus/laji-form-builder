import express, { RequestHandler, Response } from "express";
import bodyParser from "body-parser";
import path from "path";
import { isLang, Lang } from "../model";
import MainService from "./services/main-service";

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

const main = new MainService();
const server = express();

server.use("/api", bodyParser.json({limit: "1MB"}));

server.get("/api/flush", async (req, res) => {
	main.flush();
	return res.json({flush: "ok"});
});

server.get("/api", langCheckMiddleWare, async (req, res) => {
	const {lang} = req.query;
	return res.json({forms: await main.getForms(lang as (Lang | undefined))});
});

server.get("/api/:id", langCheckMiddleWare, async (req, res) => {
	const {id} = req.params;
	const {lang, format = "json"} = req.query;
	if (format !== "schema" && format !== "json") {
		return error(res, 422, "Query param format should be one of 'json', 'schema'");
	}
	return res.json(await main.getForm(id, lang as (Lang | undefined), format));
});

server.post("/api", async (req, res) => {
	if (req.body.id) {
		return error(res, 422, "Shouldn't specify id when creating a new form entry");
	}
	return res.json(await main.saveForm(req.body));
});

server.put("/api/:id", async (req, res) => {
	res.json(await main.updateForm(req.params.id, req.body));
});

server.delete("/api/:id", async (req, res) => {
	return res.json(await main.deleteForm(req.params.id));
});

server.post("/api/transform", langCheckMiddleWare, async (req, res) => {
	return res.json(await main.transform(req.body, req.query.lang as (Lang | undefined)));
});

server.get("/*", async (req, res, next) => {
	// '/static' and webpack must be manually ignored here because it can't be routed before
	// this route, since dev/prod setups need to handle the routes after the main server.ts
	if (req.url.startsWith("/static/") || req.url.startsWith("/__webpack")) {
		return next();
	}
	res.sendFile(path.join(__dirname, "app", "index.html"));
});

export default server;
