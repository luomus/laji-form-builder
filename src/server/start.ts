import express from "express";
import server from "./server";

server.use("/static", express.static("static"));

const port = process.env.PORT || 8082;
server.listen(port, () => {
	console.log(`Server up on port ${port}`);
});
