import express, { RequestHandler } from "express";
import path from "path";
import server from "./server";

const view: RequestHandler = async (req, res, next) => {
	// '/static' and webpack must be manually ignored here because it can't be routed before
	// this route, since dev/prod setups need to handle the routes after the main server.ts
	if (req.url.match("/static") || req.url.startsWith("/__webpack")) {
		return next();
	}
	res.setHeader("Cache-Control", "no-store");
	res.sendFile(path.join(__dirname, "..", "static", "index.html"), {dotfiles: "allow"});
};
server.use("/", view);
server.use("/static", express.static("static"));

const port = process.env.PORT || 8082;
server.listen(port, () => {
	console.log(`Server up on port ${port}`);
});
