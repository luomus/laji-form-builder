import request from "supertest";
import app, { formFetch, exposedProps } from "../../src/server/server";
import { Master } from "../../src/model";

// Hack for jasmine/supertest integration, see https://github.com/jasmine/jasmine-npm/issues/31
const finish = (done: DoneFn) => (err: string | Error) => err ? done.fail(err) : done();

const TEST_FORM_ID = "MHL.119";

const commonProps = [
	"name", "description", "language", "title", "shortDescription",
	"uiSchema", "options", "id",
];
const masterProps = [...commonProps, "@type", "@context", "fields"];
const schemaFormatProps = [
	...commonProps, "attributes", "schema", "validators", "warnings",
	"excludeFromCopy", "uiSchemaContext", "extra"
];

let testForm: Master;

describe("", () => {

	beforeAll(async done => {
		testForm = await formFetch(`/${TEST_FORM_ID}`);
		done();
	});

	describe("/ (form listing)", () => {
		let forms: any[];

		it("returns 422 for bad lang", async (done) => {
			request(app)
				.get("/?lang=badlang")
				.expect(422)
				.end(finish(done));
		});

		it("returns list of forms", async (done) => {
			request(app)
				.get("/")
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect(response => {
					forms = response.body.forms;
					expect(forms.length).toBeGreaterThan(0);
				})
				.end(finish(done));
		});

		it("returns as untranslated", async (done) => {
			if (!forms) {
				return;
			}

			const testFormResponse = forms.find((f: any) => f.id === TEST_FORM_ID);
			expect(testFormResponse.title[0]).toBe("@");
			done();
		});


		// When new prop is added to be exposed, note that this might fail if none of the forms return that prop!
		it("returns only certain properties", async (done) => {
			if (!forms) {
				return;
			}

			const gatheredProperties: Record<string, boolean> = {};

			forms.forEach(f => {
				Object.keys(f).forEach(key => {
					gatheredProperties[key] = true;
				});
			});

			expect(gatheredProperties).toEqual(exposedProps);

			done();
		});

		it("doesn't return any other properties", async (done) => {
			if (!forms) {
				return;
			}

			forms.forEach(f => {
				Object.keys(f).forEach(key => {
					expect((exposedProps as any)[key]).toBe(true);
				});
			});

			done();
		});

		it("returns translated when query param lang present", async (done) => {
			request(app)
				.get("/?lang=fi")
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect(response => {
					const testFormResponse = response.body.forms.find((f: any) => f.id === TEST_FORM_ID);
					expect(testFormResponse.title)
						.toBe((testForm.translations as any).fi[(testForm.title as string)]);
				})
				.end(finish(done));
		});
	});

	describe("/:id (get form)", () => {
		it("returns 422 for bad lang", async (done) => {
			request(app)
				.get(`/${TEST_FORM_ID}?lang=badlang`)
				.expect(422)
				.end(finish(done));
		});

		it("returns in master format by default", async (done) => {
			request(app)
				.get(`/${TEST_FORM_ID}`)
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect((response: any) => {
					const form = response.body;
					expect(form).toBeDefined();
					[...masterProps, "translations"].forEach(prop => {
						expect(form[prop]).toBeTruthy(`Expected ${prop} to be defined`);
					});
					expect(form.title[0]).toBe("@", "Form title wasn't in untranslated format");
				})
				.end(finish(done));
		});

		it("returns translated and without translations when query param lang present", async (done) => {
			request(app)
				.get(`/${TEST_FORM_ID}?lang=fi`)
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect((response) => {
					expect(response.body.title)
						.toBe((testForm.translations as any).fi[(testForm.title as string)]);
					expect(response.body.translations).toBe(undefined);
				})
				.end(finish(done));
		});

		it("returns in schema format when query param format=schema", async (done) => {
			request(app)
				.get(`/${TEST_FORM_ID}?format=schema`)
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect((response: any) => {
					const form = response.body;
					[...schemaFormatProps, "translations"].forEach(prop => {
						expect(form[prop]).toBeTruthy(`Expected ${prop} to be defined`);
					});
					expect(form.title[0]).toBe("@");
				})
				.end(finish(done));
		});

		// eslint-disable-next-line max-len
		it("returns in schema format and translated and without translations when format=schema and query param lang present", async (done) => {
			request(app)
				.get(`/${TEST_FORM_ID}?format=schema&lang=fi`)
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect((response: any) => {
					const form = response.body;
					[...schemaFormatProps].forEach(prop => {
						expect(form[prop]).toBeTruthy(`Expected ${prop} to be defined`);
					});
					expect(response.body.translations).toBe(undefined);
					expect(form.title)
						.toBe((testForm.translations as any).fi[(testForm.title as string)]);
				})
				.end(finish(done));
		});
	});

	describe("/transform", () => {
		it("returns 422 for bad lang", async (done) => {
			request(app)
				.post("/transform?lang=badlang")
				.send(testForm)
				.expect(422)
				.end(finish(done));
		});

		it("transforms master format to schema format untranslated without lang param", async (done) => {
			request(app)
				.post("/transform")
				.send(testForm)
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect((response: any) => {
					const form = response.body;
					expect(form).toBeDefined();
					[...schemaFormatProps, "translations"].forEach(prop => {
						expect(form[prop]).toBeTruthy(`Expected ${prop} to be defined`);
					});
					expect(form.title[0]).toBe("@", "Form title wasn't in untranslated format");
				})
				.end(finish(done));
		});

		it("transforms master format to schema format translated when query param lang present", async (done) => {
			request(app)
				.post("/transform")
				.send(testForm)
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect((response: any) => {
					const form = response.body;
					[...schemaFormatProps].forEach(prop => {
						expect(form[prop]).toBeTruthy(`Expected ${prop} to be defined`);
					});
					expect(form.title[0]).toBe("@");
				})
				.end(finish(done));
		});
	});
});
