# laji-form-builder

This repo is responsible for two things:
* the **server** aka form backend which runs at https://form.laji.fi
* the **client** which is a React component for editing forms. Available as an npm package [`laji-form-builder`](https://www.npmjs.com/package/laji-form-builder).

## Server API

* `/?{lang:fi | en | sv = fi}` UI for selecting/deleting a form
* `/:id?{lang:fi | en | sv = fi}` UI for editing a form

REST JSON API `/api`:
* `/api?{lang?: fi | en | sv}` list forms as JSON
* `/api/:id?{lang?: fi | en | sv, format: json | schema | schema-with-enums = json, expand: true | false = true}` list forms as JSON
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
* playwright (e2e tests)
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

#### Server

Server is tested without having to run the server. Just run:

```
npm run test:server
```

##### Env variables:

* `MOCK=true`: Field service test API requests are mocked by default.

#### Client

Server can be running or or not. If it's not running, it will be automatically started.

```
npm run test:client
```

##### Dependencies

To run the tests, you might need to install playwright dependencies:

```
npx playwright install
```

If you run into issues with browser dependencies etc, there's also a dockerized runner:

```
npm run test:client:docker
```

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
