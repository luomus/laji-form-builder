import request from "supertest";
import app, { formFetch, exposedProps } from "../../src/server/server";
import { Master } from "../../src/model";

// Hack for jasmine/supertest integration, see https://github.com/jasmine/jasmine-npm/issues/31
const finish = (done: DoneFn) => (err: string | Error) => err ? done.fail(err) : done();

const TRIP_REPORT_ID = "JX.519";

describe("/ (form listing)", () => {

	let tripReportForm: Master;

	beforeAll(async done => {
		tripReportForm = await formFetch(`/${TRIP_REPORT_ID}`);
		done();
	});

	let forms: any[];
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

		const tripReportResponse = forms.find((f: any) => f.id === TRIP_REPORT_ID);
		expect(tripReportResponse.title[0]).toBe("@");
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
				const tripReportResponse = response.body.forms.find((f: any) => f.id === TRIP_REPORT_ID);
				expect(tripReportResponse.title)
					.toBe((tripReportForm.translations as any).fi[(tripReportForm.title as string)]);
			})
			.end(finish(done));
	});
});
