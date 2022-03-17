import express from "express";
import server from "./server";

server.use("/static", express.static("static"));

server.listen(process.env.PORT || 8082);
