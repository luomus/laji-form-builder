# laji-form-builder
This repo is responsible for two things:
* the **server** aka form backend which runs at https://form.laji.fi
* the **client** which is a React component for editing forms. Available as an npm package [`laji-form-builder`](https://www.npmjs.com/package/laji-form-builder).

## Server API

* `/?{lang:fi | en | sv = fi}` UI for selecting/deleting a form
* `/:id?{lang:fi | en | sv = fi}` UI for editing a form

REST JSON API `/api`:
* `/api?{lang?: fi | en | sv}` list forms as JSON
* `/api/:id?{lang?: fi | en | sv, format: json | schema = json}` list forms as JSON
* `/api` (`POST`) Create new form entry
* `/api/:id` (`PUT`) Update form entry
* `/api/:id` (`DELETE`) Delete form entry
* `/api/transform?{lang?: fi | en | sv}` (`POST`) Transform BODY from `json` format to `schema` format
* `/api/flush` flushes cache

## Client API

For documentation, see how the server uses the `Builder` component: https://github.com/luomus/laji-form-builder/blob/master/src/server/view/app.tsx

## Development

### Stack

* node@14
* TypeScript
* express
* React
* protractor (e2e tests)
* supertest (express tests)

Development is done against node `v14`. Might work on other versions or might not.

### Install dependencies
```
npm ci
```

### Configuration

Copy `config.json.example` to `config.json`, and fill the configuration file.

### Development

Start the development server (it's the same as the production server but with hot reload enabled so code changed are reflected upon file changes):
```
npm start
```

### Tests

Both server/client tests use jasmine. Client e2e testing is done with protractor on top of jasmine.

#### Server
Server is tested without having to run the server. Just run:

```
npm run test:server
```

##### Env variables:

* `MOCK=true`: Field service test API requests are mocked by default.

#### Client
First start the development server. You might need to update the webdriver manager:
```
node_modules/.bin/webdriver-manager update
```

Then run the e2e tests:
```
npm run test:client
```

##### Debugging

You can debug the tests by running `npm run test:client:debug`. Details in [protractor docs](https://www.protractortest.org/#/debugging).


##### Env variables:

* `HEADLESS=false`: Run the tests in an actual browser window instead of the headless browser. Supports only Chrome.
* `TEST_BROWSER=chrome`: `firefox` will run against firefox, `multi` against both.
* `THREADS=4`: How many browser instances the tests are run against. 

### Build

#### Server

To build the server (compiles both `static` and `build`):
```
npm run build:server
```

In production, run the built server with:

```
npm run start:prod
````

#### npm package

To build the npm package (compiles `lib`):
```
npm run build:client
```

### Publishing to npm

Run `npm version {patch,minor,major}`. This will run the linting & front end tests (and halt if they fail), build the client and publish to npm. We follow [semantic versioning](https://docs.npmjs.com/about-semantic-versioning).
