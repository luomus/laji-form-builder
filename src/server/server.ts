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
const api = express();

api.use("/", bodyParser.json({limit: "1MB"}));

api.get("/flush", async (req, res) => {
	main.flush();
	return res.json({flush: "ok"});
});

api.get("/", langCheckMiddleWare, async (req, res) => {
	const {lang} = req.query;
	return res.json({forms: await main.getForms(lang as (Lang | undefined))});
});

api.get("/:id", langCheckMiddleWare, async (req, res) => {
	const {id} = req.params;
	const {lang, format = "json"} = req.query;
	if (format !== "schema" && format !== "json") {
		return error(res, 422, "Query param format should be one of 'json', 'schema'");
	}
	return res.json(await main.getForm(id, lang as (Lang | undefined), format));
});

api.post("/", async (req, res) => {
	if (req.body.id) {
		return error(res, 422, "Shouldn't specify id when creating a new form entry");
	}
	return res.json(await main.saveForm(req.body));
});

api.put("/:id", async (req, res) => {
	res.json(await main.updateForm(req.params.id, req.body));
});

api.delete("/:id", async (req, res) => {
	return res.json(await main.deleteForm(req.params.id));
});

api.post("/transform", langCheckMiddleWare, async (req, res) => {
	return res.json(await main.transform(req.body, req.query.lang as (Lang | undefined)));
});

const view: RequestHandler = async (req, res, next) => {
	// '/static' and webpack must be manually ignored here because it can't be routed before
	// this route, since dev/prod setups need to handle the routes after the main server.ts
	if (req.url.match("/static") || req.url.startsWith("/__webpack")) {
		return next();
	}
	res.sendFile(path.join(__dirname, "view", "index.html"));
};

const server = express();

// Backward compatibility for old server's URI signature.
server.get("/lajiform/admin/demo", (req, res) => {
	res.redirect("/");
});
server.use("/lajiform/admin/flush", (req, res) => {
	res.redirect("/api/flush");
});
server.use("/lajiform", (req, res) => {
	const redirectPath = "/api" + req.originalUrl.split("lajiform")[1];
	res.redirect(redirectPath);
});

server.use("/api", api);
server.get("/*", view);

export default server;
