const path = require("path");
const webpack = require("webpack");

const webpackConf = require("./webpack.config.static");

module.exports = {
	...webpackConf,
	mode: "development",
	output: {
		publicPath: "/build/",
		filename: "main.js"
	},
	plugins: [
		new webpack.DefinePlugin({"process.env.NODE_ENV": "\"development\""})
	],
	devServer: {
		static: {
			directory: path.join(path.resolve(), "playground"),
		},
		host: "0.0.0.0",
		port: 8082,
		hot: true
	}
};
