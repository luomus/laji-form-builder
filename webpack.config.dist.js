const path = require("path");
const webpack = require("webpack");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
	mode: "production",
	entry: {
		"laji-form-builder": "./src/app",
		styles: "./src/styles"
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
				loader: "awesome-typescript-loader?module=es6",
				include: [
					path.join(__dirname, "src"),
				]
			},
			{
				test: /\.json$/,
				loader: "json-loader",
				include: [
					path.join(__dirname, "node_modules", "ajv", "libs", "refs", "json-schema-draft-07.json"),
				]
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
				test: /\.woff(2)?(\?v=[0-9].[0-9].[0-9])?$/,
				loader: "url-loader?mimetype=application/font-woff"
			},
			{
				test: /\.(ttf|eot|svg|png|jpg|gif)(\?v=[0-9].[0-9].[0-9])?$/,
				loader: "file-loader?name=images/[name].[ext]"
			},
		],
		noParse: [
			/node_modules\/proj4\/dist\/proj4\.js/
		]
	},
	resolve: {
		extensions: [".tsx", ".ts",  ".jsx", ".js", ".json"]
	}
};
