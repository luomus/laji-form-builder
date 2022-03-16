const path = require("path");
const webpack = require("webpack");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
	mode: "production",
	entry: {
		"laji-form-builder": "./src/client/app",
		styles: "./src/client/styles"
	},
	output: {
		path: path.join(__dirname, "dist"),
		filename: "[name].js",
		libraryTarget: "umd"
	},
	plugins: [
		new MiniCssExtractPlugin({filename: "[name].css"}),
		new webpack.IgnorePlugin(/^(buffertools)$/), // unwanted "deeper" dependency
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
					path.join(path.resolve(), "src"),
				],
				exclude: [
					/.d.ts$/,
					path.join(path.resolve(), "src", "server"),
				]
			},
			{
				test: /.d.ts$/,
				use: [{
					loader: "ignore-loader"
				}]
			},
			{
				test: /\.s?css$/,
				use: [
					MiniCssExtractPlugin.loader,
					{
						loader: "css-loader"
					},
					{
						loader: "sass-loader"
					}
				]
			},
			{
				test: /\.(jpg|gif|ttf|eot|svg|woff2?)$/,
				type: "asset/inline"
			}
		],
		noParse: [
			/node_modules\/proj4\/dist\/proj4\.js/
		]
	},
	resolve: {
		extensions: [".tsx", ".ts",  ".jsx", ".js", ".json"]
	}
};
