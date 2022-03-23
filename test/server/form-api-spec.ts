import request from "supertest";
import app from "../../src/server/server";
import { Master } from "../../src/model";
import { exposedProps, exposedOptions, formFetch } from "../../src/server/services/main-service";

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

const expectOnlyProps = (obj: Record<string, unknown>, props: string[]) => {
	props.forEach(prop => {
		expect(obj[prop]).toBeTruthy(`Expected ${prop} to be defined`);
	});
	Object.keys(obj).forEach(prop => {
		if (!props.includes(prop)) {
			fail(`Expected ${prop} not to be defined`);
		}
	});
};

let testForm: Master;

describe("/ (form client)", () => {
	it("serves form client HTML", async (done) => {
		request(app)
			.get("/")
			.expect(200)
			.expect("Content-Type", "text/html; charset=UTF-8")
			.end(finish(done));
	});
});

describe("/api", () => {

	beforeAll(async done => {
		testForm = await formFetch(`/${TEST_FORM_ID}`);
		done();
	});

	describe("/ (form listing)", () => {
		let forms: any[];

		it("returns 422 for bad lang", async (done) => {
			request(app)
				.get("/api?lang=badlang")
				.expect(422)
				.end(finish(done));
		});

		it("returns list of forms", async (done) => {
			request(app)
				.get("/api")
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

		it("returns only certain options", async (done) => {
			const gatheredOptions: Record<string, boolean> = {};
			forms.forEach(f => {
				f.options && Object.keys(f.options).forEach(key => {
					gatheredOptions[key] = true;
				});
			});
			expect(gatheredOptions).toEqual(exposedOptions);
			done();
		});

		it("doesn't return any other options", async (done) => {
			if (!forms) {
				return;
			}
			forms.forEach(f => {
				f.options && Object.keys(f.options).forEach(key => {
					expect((exposedOptions as any)[key]).toBe(true);
				});
			});
			done();
		});

		it("returns translated when query param lang present", async (done) => {
			request(app)
				.get("/api?lang=fi")
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
				.get(`/api/${TEST_FORM_ID}?lang=badlang`)
				.expect(422)
				.end(finish(done));
		});

		it("returns in master format by default", async (done) => {
			request(app)
				.get(`/api/${TEST_FORM_ID}`)
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect((response: any) => {
					const form = response.body;
					expect(form).toBeDefined();
					expectOnlyProps(form, [...masterProps, "translations"]);
					expect(form.title[0]).toBe("@", "Form title wasn't in untranslated format");
				})
				.end(finish(done));
		});

		it("returns translated and without translations when query param lang present", async (done) => {
			request(app)
				.get(`/api/${TEST_FORM_ID}?lang=fi`)
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
				.get(`/api/${TEST_FORM_ID}?format=schema`)
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect((response: any) => {
					const form = response.body;
					expectOnlyProps(form, [...schemaFormatProps, "translations"]);
					expect(form.title[0]).toBe("@");
				})
				.end(finish(done));
		});

		// eslint-disable-next-line max-len
		it("returns in schema format and translated and without translations when format=schema and query param lang present", async (done) => {
			request(app)
				.get(`/api/${TEST_FORM_ID}?format=schema&lang=fi`)
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect((response: any) => {
					const form = response.body;
					expectOnlyProps(form, schemaFormatProps);
					expect(form.title)
						.toBe((testForm.translations as any).fi[(testForm.title as string)]);
				})
				.end(finish(done));
		});
	});

	describe("/transform", () => {
		it("returns 422 for bad lang", async (done) => {
			request(app)
				.post("/api/transform?lang=badlang")
				.send(testForm)
				.expect(422)
				.end(finish(done));
		});

		it("transforms master format to schema format untranslated without lang param", async (done) => {
			request(app)
				.post("/api/transform")
				.send(testForm)
				.set("Content-Type", "application/json")
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect((response: any) => {
					const form = response.body;
					expect(form).toBeDefined();
					expectOnlyProps(form, [...schemaFormatProps, "translations"]);
					expect(Object.keys(form.schema).length).not.toBe(0);
					expect(form.title[0]).toBe("@", "Form title wasn't in untranslated format");
				})
				.end(finish(done));
		});

		it("transforms master format to schema format translated when query param lang present", async (done) => {
			request(app)
				.post("/api/transform?lang=fi")
				.send(testForm)
				.set("Content-Type", "application/json")
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect((response: any) => {
					const form = response.body;
					expectOnlyProps(form, schemaFormatProps);
					expect(form.title)
						.toBe((testForm.translations as any).fi[(testForm.title as string)]);
				})
				.end(finish(done));
		});
	});

	let createdForm: Master;

	describe("/ POST (form creation)", () => {
		it("returns 422 if form has id", async (done) => {
			request(app)
				.post("/api")
				.send(testForm)
				.set("Content-Type", "application/json")
				.expect(422)
				.end(finish(done));
		});

		it("creates form and returns in master format", async (done) => {
			const {id, ..._testForm} = testForm;
			request(app)
				.post("/api")
				.send(_testForm)
				.set("Content-Type", "application/json")
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect((response: any) => {
					createdForm = response.body as Master;
					expectOnlyProps(createdForm as any, [...masterProps, "translations"]);
					expect((createdForm.title as string)[0]).toBe("@");
				})
				.end(finish(done));
		});
	});

	describe("/:id PUT (form update)", () => {
		it("updates form and returns in master format", async (done) => {
			const title = "test title";
			request(app)
				.put(`/api/${createdForm.id}`)
				.send({...createdForm, title})
				.set("Content-Type", "application/json")
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect((response: any) => {
					const form = response.body;
					expectOnlyProps(form, [...masterProps, "translations"]);
					expect(form.fields.length).not.toBe(0);
					expect(form.title).toBe(title);
				})
				.end(finish(done));
		});
	});

	describe("/:id DELETE (form delete)", () => {
		it("updates form and returns in master format", async (done) => {
			request(app)
				.delete(`/api/${createdForm.id}`)
				.expect(200)
				.expect((response: any) => {
					expect(response.body.affected).toBe(1);
				})
				.end(finish(done));
		});
	});

	describe("/flush", () => {
		it("works", async (done) => {
			request(app)
				.get("/api/flush")
				.expect(200)
				.expect((response: any) => {
					expect(response.body.flush).toBe("ok");
				})
				.end(finish(done));
		});
	});
});
