import server from "./server";
import webpack from "webpack";
const webpackConfig = require("../../webpack.config.static.js");

const config = {
	...webpackConfig,
	mode: "development",
	devtool: "inline-source-map",
	plugins: [
		new webpack.DefinePlugin({"process.env.NODE_ENV": "\"development\""}),
		new webpack.HotModuleReplacementPlugin(),
	],
	output: {
		publicPath: "/static",
		clean: true
	},
	entry: [
		...webpackConfig.entry,
		"webpack-hot-middleware/client",
	]
};
const compiler = webpack(config);

server.use(require("webpack-dev-middleware")(compiler, {
	 publicPath: "/static"
}));
server.use(require("webpack-hot-middleware")(compiler));

server.listen(8084);
