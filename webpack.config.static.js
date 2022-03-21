const path = require("path");
const webpack = require("webpack");

module.exports = {
	mode: "production",
	entry: [
		path.join(path.resolve(), "src", "server", "view", "app")
	],
	output: {
		path: path.join(__dirname, "static"),
		filename: "main.js"
	},
	plugins: [
		new webpack.DefinePlugin({"process.env.NODE_ENV": "\"production\""})
	],
	module: {
		rules: [
			{
				test: /\.(j|t)sx?$/,
				use: [{
					loader: "ts-loader"
				}],
				include: [
					path.join(path.resolve(), "src")
				],
				exclude: /node_modules|.d.ts$/
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
			},
			{
				test: /\.s?css$/,
				use: [
					{
						loader: "style-loader"
					},
					{
						loader: "css-loader"
					},
					{
						loader: "sass-loader"
					}
				]
			},
			{
				test: /\.(png|gif)$/,
				type: "asset/inline"
			},
			{
				test: /\.(jpg|ttf||eot|svg)$/,
				type: "asset/resource"
			},
		],
		noParse: [
			/dist\/(ol|proj4).js/
		]
	},
	resolve: {
		extensions: [".tsx", ".ts", ".js", ".json"]
	}
};
