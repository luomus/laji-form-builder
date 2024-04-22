const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

const devMode = process.env.NODE_ENV !== "production";

module.exports = {
	mode: process.env.NODE_ENV,
	entry: [
		path.join(path.resolve(), "src", "server", "view", "app")
	],
	output: {
		path: path.join(__dirname, "static"),
		filename: "[name].[contenthash].js",
		publicPath: "/static",
		clean: true
	},
	optimization: {
		moduleIds: "deterministic",
		runtimeChunk: "single",
		splitChunks: {
			cacheGroups: {
				vendor: {
					test: /[\\/]node_modules[\\/]/,
					name: "vendors",
					chunks: "all",
				},
			},
		}
	},
	plugins: [
		new HtmlWebpackPlugin({
			template: path.join(path.resolve(), "src", "server", "view", "index.html"),
			favicon: path.join(path.resolve(), "src", "server", "view", "favicon.ico")
		}),
		...(devMode ? [] : [new MiniCssExtractPlugin({filename: "[name].[hash].css"})])
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
					devMode ? "style-loader" : MiniCssExtractPlugin.loader,
					"css-loader",
					"sass-loader"
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
}
