const path = require("path");
const webpack = require("webpack");

module.exports = {
	mode: "development",
	devtool: "eval",
	entry: [
		path.join(path.resolve(), "playground", "app")
	],
	output: {
		publicPath: "/build/",
		filename: "main.js"
	},
	plugins: [
		new webpack.HotModuleReplacementPlugin(),
		new webpack.DefinePlugin({"process.env.NODE_ENV": "\"development\""})
	],
	devServer: {
		contentBase: path.join(path.resolve(), "playground"),
		host: "0.0.0.0",
		port: 8082,
		inline: true
	},
	module: {
		rules: [
			{
				test: /\.(j|t)sx?$/,
				use: [{
					loader: "ts-loader"
				}],
				include: [
					path.join(path.resolve(), "src"),
					path.join(path.resolve(), "playground")
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
