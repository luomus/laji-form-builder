import server from "./server";
import webpack from "webpack";
import path from "path";
import historyApiFallback from "connect-history-api-fallback";
const webpackConfig = require("../../webpack.config.static.js");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const config = {
	...webpackConfig,
	mode: "development",
	devtool: "inline-source-map",
	plugins: [
		new webpack.DefinePlugin({"process.env.NODE_ENV": "\"development\""}),
		new HtmlWebpackPlugin({
			template: path.join(path.resolve(), "src", "server", "view", "index.html"),
			favicon: path.join(path.resolve(), "src", "server", "view", "favicon.ico")
		}),
		new webpack.HotModuleReplacementPlugin()
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

// Redirect all but /static/* to the static index.html, since it's a  single-page app.
server.use(historyApiFallback({
	rewrites: [
		{from: /^\/static\//, to: (context) => {
			return context.parsedUrl.pathname as string;
		}}
	],
	verbose: true,
	disableDotRule: true,
	index: "/static/index.html"
}));

server.use(require("webpack-dev-middleware")(compiler, {
	publicPath: "/static"
}));
server.use(require("webpack-hot-middleware")(compiler, {
	noInfo: true
}));

const port = process.env.PORT || 8082;
server.listen(port, () => {
	console.log(`Server up on port ${port}`);
});
