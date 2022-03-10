import "jasmine";
// import request from "supertest";
// import app from "../src/server/server";
function finish_test (done) {
	return function (err) {
		if (err) {
			done.fail(err)
		} else {
			done()
		}
	}
}

console.log("TRESTING");
describe("Server", () => {
	  describe("REST API v1", () => {
			    it("returns a JSON payload", (done) => {
						expect(true).toBe(true);
						finish_test(done);
						// done();
						    //   request(app)
						    //     .get("/rest/service/v1/categories")
						    //     .expect(200)
						    //     .expect("Content-Type", "application/json; charset=utf-8")
						    //     .end((error) => (error) ? done.fail(error) : done());
						    // });
			  });
});
