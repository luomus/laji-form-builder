import express, { ErrorRequestHandler, RequestHandler, Response } from "express";
import bodyParser from "body-parser";
import path from "path";
import { isLang, Lang } from "../model";
import MainService, { StoreError, UnprocessableError } from "./services/main-service";

const error = (res: Response, status: number, error: any, stack?: any) => {
	const err: any = {
		status,
		error
	};
	if (stack) {
		err.stack = stack;
	}
	return res.status(status).json(err);
};

const langCheckMiddleWare: RequestHandler = (req, res, next) => {
	const {lang} = req.query;
	if (typeof lang === "string" && !isLang(lang)) {
		return error(res, 422, "Query param lang should be one of 'fi', 'sv' or 'en'");
	}
	return next();
};

const errorHandlerMiddleWare: ErrorRequestHandler = (err, req, res, next) => {
	if (err instanceof UnprocessableError) {
		error(res, 422, err.message);
	} else {
		error(res, 500, err.message, err.stack);
	}
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
	return res.status(200).json({forms: await main.getForms(lang as (Lang | undefined))});
});

api.get("/:id", langCheckMiddleWare, async (req, res) => {
	const {id} = req.params;
	const {lang, format = "json"} = req.query;
	if (format !== "schema" && format !== "json") {
		return error(res, 422, "Query param format should be one of 'json', 'schema'");
	}
	return res.status(200).json(await main.getForm(id, lang as (Lang | undefined), format));
});

api.post("/", async (req, res) => {
	if (req.body.id) {
		return error(res, 422, "Shouldn't specify id when creating a new form entry");
	}
	let result: any;
	try {
		result = await main.saveForm(req.body);
	} catch (e) {
		if (e instanceof StoreError) {
			return error(res, e.status, e.storeError);
		}
		throw e;
	}
	return res.status(200).json(result);
});

api.put("/:id", async (req, res) => {
	let result: any;
	try {
		result = await main.updateForm(req.params.id, req.body);
	} catch (e) {
		if (e instanceof StoreError) {
			return error(res, e.status, e.storeError);
		}
		throw e;
	}
	return res.status(200).json(result);
});

api.delete("/:id", async (req, res) => {
	return res.status(200).json(await main.deleteForm(req.params.id));
});

api.post("/transform", langCheckMiddleWare, async (req, res) => {
	return res.status(200).json(await main.transform(req.body, req.query.lang as (Lang | undefined)));
});

api.use(errorHandlerMiddleWare);

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
server.use("/", view);

export default server;
