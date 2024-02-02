import request from "supertest";
import app from "../../src/server/server";
import { FormListing, Master } from "../../src/model";
import {
	exposedListedProps as _exposedListedProps,
} from "../../src/server/services/main-service";
import { formFetch } from "../../src/server/services/store-service";

// The '_exposedListedProps' from main service doesn't have these two props even though they are really exposed.
const exposedListedProps = {
	..._exposedListedProps,
	baseFormID: true,
	fieldsFormID: true
};

// Hack for jasmine/supertest integration, see https://github.com/jasmine/jasmine-npm/issues/31
const finish = (done: DoneFn) => (err: string | Error) => err ? done.fail(err) : done();

const TEST_FORM_ID = "MHL.119";
const TEST_FORM_WITH_BASE_EXTENDS = "MHL.59";
const TEST_FORM_WITH_FIELDS_ID = "MHL.32";
const TEST_FORM_WITH_FIELDS_ID_EXTENDS = "MHL.36";

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

describe("/api", () => {

	beforeAll(async done => {
		testForm = await formFetch(`/${TEST_FORM_ID}`) as Master;
		done();
	});

	describe("/ (form listing)", () => {
		let forms: any[];

		it("returns 422 for bad lang", (done) => {
			request(app)
				.get("/api?lang=badlang")
				.expect((response: any) => {
					expect(response.status).toBe(422);
					expect(response.error).toBeTruthy();
				})
				.end(finish(done));
		});

		it("returns list of forms", (done) => {
			request(app)
				.get("/api")
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect(response => {
					forms = response.body.forms;
					expect(forms.length).toBeGreaterThan(0);
				})
				.end(finish(done));
		}, 10000); // 10s

		it("returns as untranslated", (done) => {
			if (!forms) {
				return;
			}

			const testFormResponse = forms.find((f: any) => f.id === TEST_FORM_ID);
			expect(testFormResponse.title[0]).toBe("@");
			done();
		});


		// When new prop is added to be exposed, note that this might fail if none of the forms return that prop!
		it("returns only certain properties", (done) => {
			if (!forms) {
				return;
			}
			const gatheredProperties: Record<string, boolean> = {};
			forms.forEach(f => {
				Object.keys(f).forEach(key => {
					gatheredProperties[key] = true;
				});
			});
			expect(gatheredProperties).toEqual(exposedListedProps);
			done();
		});

		it("doesn't return any other properties", (done) => {
			if (!forms) {
				return;
			}
			forms.forEach(f => {
				Object.keys(f).forEach(key => {
					expect((exposedListedProps as any)[key]).toBe(true);
				});
			});
			done();
		});

		it("extends base form", async (done) => {
			const extendingForm = await formFetch(`/${TEST_FORM_WITH_BASE_EXTENDS}?expand=false`) as Master;
			request(app)
				.get("/api")
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect(response => {
					forms = response.body.forms;
					const listedBaseForm = forms.find((f: FormListing) => f.id === TEST_FORM_WITH_BASE_EXTENDS);
					expect(listedBaseForm.options).toEqual({
						...listedBaseForm.options,
						...extendingForm.options
					});
				})
				.end(finish(done));
		});

		it("returns translated when query param lang present", (done) => {
			request(app)
				.get("/api?lang=fi")
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect(response => {
					const testFormResponse = response.body.forms.find((f: FormListing) => f.id === TEST_FORM_ID);
					expect(testFormResponse.title)
						.toBe((testForm.translations as any).fi[(testForm.title as string)]);
				})
				.end(finish(done));
		});

		it("returns supportedLanguage all if none specified", (done) => {
			const testForm = forms.find(f => f.id === TEST_FORM_ID);
			expect(testForm.supportedLanguage).toEqual(["en", "fi", "sv"]);
			done();
		});

		it("returns empty options if undefined", (done) => {
			forms.forEach(f => {
				expect(f.options).not.toBe(undefined);
			});
			done();
		});
	});

	describe("/:id (get form)", () => {
		it("returns 422 for bad lang", (done) => {
			request(app)
				.get(`/api/${TEST_FORM_ID}?lang=badlang`)
				.expect((response: any) => {
					expect(response.status).toBe(422);
					expect(response.error).toBeTruthy();
				})
				.end(finish(done));
		});

		it("returns 404 for bad id", (done) => {
			request(app)
				.get("/api/foobar")
				.expect((response: any) => {
					expect(response.status).toBe(404);
					expect(response.error).toBeTruthy();
				})
				.end(finish(done));
		});

		it("returns in master format by default", (done) => {
			request(app)
				.get(`/api/${TEST_FORM_ID}`)
				.expect(200)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect((response: any) => {
					const form = response.body;
					expect(form).toBeDefined();
					expectOnlyProps(form, [...masterProps, "translations", "extra"]);
					expect(form.title[0]).toBe("@", "Form title wasn't in untranslated format");
				})
				.end(finish(done));
		});

		it("returns in master format when expand false", (done) => {
			request(app)
				.get(`/api/${TEST_FORM_ID}?expand=false`)
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

		it("returns translated and without translations when query param lang present", (done) => {
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

		it("returns in schema format when query param format=schema", (done) => {
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
		it("returns in schema format and translated and without translations when format=schema and query param lang present", (done) => {
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

	it("extends fields from fieldsFromID", (done) => {
		request(app)
			.get(`/api/${TEST_FORM_WITH_FIELDS_ID}`)
			.expect(200)
			.expect("Content-Type", "application/json; charset=utf-8")
			.end((err, response) => {
				if (err) {
					return finish(done)(err);
				}
				const form = response.body;
				request(app)
					.get(`/api/${TEST_FORM_WITH_FIELDS_ID_EXTENDS}`)
					.expect(200)
					.expect("Content-Type", "application/json; charset=utf-8")
					.expect(response => {
						const fieldsFromForm = response.body;
						// Test that field somewhat match - they are partly patched by the extending form so
						// an equal match can't be checked.
						fieldsFromForm.fields.forEach((f: any, i: number) => {
							expect(fieldsFromForm.fields[i].name).toEqual(form.fields[i].name);
						});
					})
					.end(finish(done));
			});
	});

	describe("/transform", () => {
		it("returns 422 for bad lang", (done) => {
			request(app)
				.post("/api/transform?lang=badlang")
				.send(testForm)
				.expect((response: any) => {
					expect(response.status).toBe(422);
					expect(response.error).toBeTruthy();
				})
				.end(finish(done));
		});

		it("returns 500 for unexpected error", (done) => {
			request(app)
				.post("/api/transform")
				.send({patch: "foo"})
				.expect((response: any) => {
					expect(response.status).toBe(500);
					expect(response.error).toBeTruthy();
				})
				.end(finish(done));
		});

		it("returns 422 for known error", (done) => {
			request(app)
				.post("/api/transform")
				.send({fields: [{name: "foo"}]})
				.expect((response: any) => {
					expect(response.status).toBe(422);
					expect(response.error).toBeTruthy();
				})
				.end(finish(done));
		});

		it("transforms master format to schema format untranslated without lang param", (done) => {
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

		it("transforms master format to schema format translated when query param lang present", (done) => {
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
		it("returns JSON error for store error", (done) => {
			const {id, ..._testForm} = testForm;
			request(app)
				.post("/api")
				.send({..._testForm, "badprop": "bad!"})
				.set("Content-Type", "application/json")
				.expect(422)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect((response: any) => {
					expect(response.status).toBe(422);
					expect(response.error).toBeTruthy();
				})
				.end(finish(done));
		});

		it("creates form and returns in master format", (done) => {
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
		it("returns JSON error for store error", (done) => {
			request(app)
				.post("/api")
				.send({...testForm, "badprop": "bad!"})
				.set("Content-Type", "application/json")
				.expect(422)
				.expect("Content-Type", "application/json; charset=utf-8")
				.expect((response: any) => {
					expect(response.status).toBe(422);
					expect(response.error).toBeTruthy();
				})
				.end(finish(done));
		});

		it("updates form and returns in master format", (done) => {
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
		it("updates form and returns in master format",(done) => {
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
		it("works", (done) => {
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
