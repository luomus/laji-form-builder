const { SpecReporter } = require("jasmine-spec-reporter");
const { JUnitXmlReporter } = require("jasmine-reporters");

// Firefox isn't run default since it has a bug with mousemove (See https://github.com/angular/protractor/issues/4715 )
const [width, height] = [800, 1000];
const threads = process.env.HEADLESS === "false" ? 1 : parseInt(process.env.THREADS || 4);
const common = {
	shardTestFiles: threads !== 1,
	maxInstances: threads
};
const chrome = {
	...common,
	browserName: "chrome",
	chromeOptions: {
		args: ["--headless", "--disable-gpu", `window-size=${width}x${height}`, "--no-sandbox", "--disable-dev-shm-usage"]
	},
};

const firefox = {
	...common,
	browserName: "firefox",
	"firefoxOptions": {
		args: ["--headless", `--width=${width}', '--height=${height}`]
	},
	"moz:firefoxOptions": {
		args: ["--headless", `--width=${width}', '--height=${height}`]
	}
};

let multiCapabilities = [chrome];
if (process.env.TEST_BROWSER === "firefox") {
	multiCapabilities = [firefox];
} else if (process.env.TEST_BROWSER === "multi") {
	multiCapabilities = [chrome, firefox];
}
if (process.env.HEADLESS && process.env.HEADLESS !== "true") multiCapabilities.forEach(capabilities => {
	const options = [capabilities["chromeOptions"], capabilities["firefoxOptions"], capabilities["moz:firefoxOptions"]];
	options.filter(o => o).forEach(_options => {
		_options.args = _options.args.filter(a => a !== "--headless");
	});
});

const standalone = process.env.STANDALONE === "true";

exports.config = {
	specs: ["test/client/*-spec.ts"],
	multiCapabilities,
	maxSessions: 4,
	SELENIUM_PROMISE_MANAGER: false,
	beforeLaunch: standalone ? () => {
		require("ts-node").register({
			project: require("path").join(__dirname, "./tsconfig.json")
		});
		require("./src/server/start-dev").default;
	} : undefined,
	onPrepare: async () => {
		require("ts-node").register({
			project: require("path").join(__dirname, "./tsconfig.json")
		});

		jasmine.getEnv().addReporter(new SpecReporter({ spec: { displayStacktrace: true } }));

		const junitReporter = new JUnitXmlReporter({
			savePath: "test-results/client",
			consolidateAll: false
		});
		jasmine.getEnv().addReporter(junitReporter);

		browser.waitForAngularEnabled(false);

		// Set manually since Firefox cli size options don't work.
		await browser.driver.manage().window().setSize(width, height);
	},
	plugins: multiCapabilities.length === 1 && multiCapabilities[0] === chrome && [{
		package: "protractor-console-plugin",
		exclude: [
			/Uncaught \(in promise\)/, /Failed to load resource:/,
			/React state update on an unmounted component./
		]
	}]
};
