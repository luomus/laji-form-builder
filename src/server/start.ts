import express, { RequestHandler } from "express";
import path from "path";
import bootstrap from "./server";

const server = bootstrap({staticPath: path.join(__dirname, "..", "static", "index.html")});

server.use("/static", express.static("static"));

const port = process.env.PORT || 8082;
server.listen(port, () => {
	console.log(`Server up on port ${port}`);
});
