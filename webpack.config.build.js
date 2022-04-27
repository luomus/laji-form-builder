const path = require("path");
const webpack = require("webpack");

module.exports = {
	mode: "development",
	devtool: "eval",
	target: "node",
	entry: [
		path.join(path.resolve(), "src", "server", "start")
	],
	output: {
		path: path.join(path.resolve(), "build"),
		filename: "main.js"
	},
	plugins: [
		new webpack.DefinePlugin({"process.env.NODE_ENV": "\"production\""})
	],
	module: {
		rules: [
			{
				test: /.tsx?$/,
				use: [{
					loader: "ts-loader"
				}],
				include: [
					path.join(path.resolve(), "src")
				],
				exclude: [
					path.join(path.resolve(), "src", "client"),
					/node_modules|.d.ts$/
				],
			},
			{
				test: /.d.ts$/,
				use: [{
					loader: "ignore-loader"
				}]
			},
			{
				test: /\.js$/,
				enforce: "pre",
				use: ["source-map-loader"],
			}
		],
		noParse: [
			/dist\/(ol|proj4).js/
		]
	},
	resolve: {
		extensions: [".tsx", ".ts", ".js", ".json"]
	}
};
