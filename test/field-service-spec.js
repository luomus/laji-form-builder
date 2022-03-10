"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var metadata_service_1 = require("../src/services/metadata-service");
var field_service_1 = require("../src/services/field-service");
var form_service_1 = require("../src/services/form-service");
var ApiClientImplementation_1 = require("../playground/ApiClientImplementation");
var ApiClient_1 = require("laji-form/lib/ApiClient");
var properties_json_1 = require("../properties.json");
var deep_equal_1 = require("deep-equal");
var LANG = "fi";
var apiClient = new ApiClient_1["default"](new ApiClientImplementation_1["default"]("https://apitest.laji.fi/v0", properties_json_1["default"].accessToken, properties_json_1["default"].userToken, LANG), LANG, { fi: {}, sv: {}, en: {} });
describe("Field service", function () {
    var formService = new form_service_1["default"](apiClient, LANG);
    var fieldService = new field_service_1["default"](apiClient, new metadata_service_1["default"](apiClient, LANG), formService, LANG);
    var forms = [
        { id: "JX.519", title: "Trip report" },
        { id: "MHL.70", title: "Dataset primary base" },
        { id: "MHL.93", title: "Coll Mikko Heikkinen" },
        { id: "MHL.1", title: "Line transect" },
        { id: "MHL.27", title: "Line transect (non-standard)" },
        { id: "MHL.28", title: "Line transect (non-standard kartoitus)" },
        { id: "JX.111712", title: "Media metadata" },
        { id: "MHL.36", title: "Named place" },
        { id: "MHL.15", title: "Annotation" }
    ];
    var _loop_1 = function (title, id) {
        describe(title + " (" + id + ")", function () {
            var master;
            var schemas;
            beforeAll(function () { return __awaiter(void 0, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, formService.getMaster(id)];
                        case 1:
                            master = _a.sent();
                            return [4 /*yield*/, formService.getSchemaFormat(id)];
                        case 2:
                            schemas = _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
            var jsonFormat;
            it("converts without errors", function () { return __awaiter(void 0, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fieldService.masterToSchemaFormat(master)];
                        case 1:
                            jsonFormat = _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
            ["schema",
                "uiSchema",
                "options",
                "validators",
                "warnings",
                "excludeFromCopy",
                "attributes",
                "extra",
                "uiSchemaContext"
            ].forEach(function (prop) {
                it("converts " + prop + " correct", function () {
                    expect(jsonFormat[prop]).toEqual(schemas[prop]);
                });
            });
            it("converts all correct", function () {
                expect(jsonFormat).toEqual(schemas);
            });
        });
    };
    for (var _i = 0, forms_1 = forms; _i < forms_1.length; _i++) {
        var _a = forms_1[_i], title = _a.title, id = _a.id;
        _loop_1(title, id);
    }
    describe("converts all correct", function () {
        var _forms;
        beforeAll(function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, formService.getForms()];
                    case 1:
                        _forms = _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it("", function () { return __awaiter(void 0, void 0, void 0, function () {
            var skips, skipContext, _loop_2, _i, _forms_1, id, state_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        skips = {
                            "MHL.40": "value_options discontinued",
                            "MHL.83": "uses nonexisting HRA.items. Not used but saved for future reference",
                            "MHL.78": "old backend doesn't like it cause gatheringEvent has a fieldset without fields. New backend will accept.",
                            "MHL.77": "old backend doesn't like it cause gatheringEvent has a fieldset without fields. New backend will accept.",
                            "MHL.23": "enum with altParent not expanded to extra & uiSchemaContext in old form backend correctly",
                            "MHL.19": "old form backend incorrectly return empty schema as []"
                        };
                        skipContext = {
                            "MHL.103": true,
                            "MHL.73": true,
                            "MHL.55": true,
                            "MHL.47": true,
                            "MHL.39": true,
                            "MHL.37": true,
                            "MHL.32": true
                        };
                        _loop_2 = function (id) {
                            var master, schemas, jsonFormat, e_1;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        if (forms.some(function (f) { return f.id === id; })) {
                                            return [2 /*return*/, "continue"];
                                        }
                                        if (skips[id]) {
                                            console.log("Skipping " + id + ": " + skips[id]);
                                            return [2 /*return*/, "continue"];
                                        }
                                        return [4 /*yield*/, formService.getMaster(id)];
                                    case 1:
                                        master = _b.sent();
                                        return [4 /*yield*/, formService.getSchemaFormat(id)];
                                    case 2:
                                        schemas = _b.sent();
                                        if (id === "MHL.6") {
                                            delete master.options.prepopulatedDocument;
                                            delete master.options.prepopulateWithInformalTaxonGroups;
                                            delete schemas.options.prepopulatedDocument;
                                            delete schemas.options.prepopulateWithInformalTaxonGroups;
                                        }
                                        _b.label = 3;
                                    case 3:
                                        _b.trys.push([3, 5, , 6]);
                                        console.log(id);
                                        return [4 /*yield*/, fieldService.masterToSchemaFormat(master, LANG)];
                                    case 4:
                                        jsonFormat = _b.sent();
                                        if (skipContext[id]) {
                                            delete jsonFormat.context;
                                        }
                                        // toEqual can't carry message so log the form manually.
                                        if (!deep_equal_1["default"](jsonFormat, schemas)) {
                                            console.log("Didn't convert " + id + " (" + master.name + ") correct");
                                            return [2 /*return*/, "break"];
                                        }
                                        expect(jsonFormat).toEqual(schemas);
                                        return [3 /*break*/, 6];
                                    case 5:
                                        e_1 = _b.sent();
                                        fail("Didn't convert " + id + " (" + master.name + ") correct (CRASHED)");
                                        return [2 /*return*/, "break"];
                                    case 6: return [2 /*return*/];
                                }
                            });
                        };
                        _i = 0, _forms_1 = _forms;
                        _a.label = 1;
                    case 1:
                        if (!(_i < _forms_1.length)) return [3 /*break*/, 4];
                        id = _forms_1[_i].id;
                        return [5 /*yield**/, _loop_2(id)];
                    case 2:
                        state_1 = _a.sent();
                        if (state_1 === "break")
                            return [3 /*break*/, 4];
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        }); });
    });
    describe("prepopulatedDocument population", function () {
        var jsonFormat;
        beforeAll(function () { return __awaiter(void 0, void 0, void 0, function () {
            var fields, form;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        fields = [
                            { name: "MY.gatherings",
                                fields: [
                                    { name: "MY.units",
                                        fields: [
                                            { name: "MY.identifications",
                                                fields: [
                                                    { name: "MY.taxon" },
                                                    { name: "MY.taxonVerbatim" },
                                                    { name: "MY.taxonID" },
                                                ] },
                                            { name: "MY.recordBasis",
                                                options: {
                                                    "default": "MY.recordBasisHumanObservation"
                                                }
                                            }
                                        ]
                                    }
                                ]
                            }
                        ];
                        form = {
                            fields: fields,
                            options: {
                                prepopulateWithInformalTaxonGroups: ["MVL.181"],
                                prepopulatedDocument: {
                                    gatherings: [{
                                            units: [{
                                                    notes: "foo"
                                                }]
                                        }]
                                }
                            }
                        };
                        return [4 /*yield*/, fieldService.masterToSchemaFormat(form, LANG)];
                    case 1:
                        jsonFormat = _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it("merges prepopulatedDocument and prepopulateWithInformalTaxonGroups", function () { return __awaiter(void 0, void 0, void 0, function () {
            var gathering;
            return __generator(this, function (_a) {
                expect(jsonFormat.options.prepopulatedDocument.gatherings.length).toBe(1);
                gathering = jsonFormat.options.prepopulatedDocument.gatherings[0];
                expect(gathering.units[0].notes).toBe("foo");
                expect(gathering.units[0].identifications[0].taxon).toBeTruthy();
                return [2 /*return*/];
            });
        }); });
        it("populates with defaults", function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                expect(jsonFormat.options.prepopulatedDocument.gatherings[0].units[0].recordBasis)
                    .toBe("MY.recordBasisHumanObservation");
                return [2 /*return*/];
            });
        }); });
        it("prepopulateWithInformalTaxonGroups fills taxon data", function () { return __awaiter(void 0, void 0, void 0, function () {
            var identification;
            return __generator(this, function (_a) {
                expect(jsonFormat.options.prepopulatedDocument.gatherings[0].units.length).toBeGreaterThan(1);
                identification = jsonFormat.options.prepopulatedDocument.gatherings[0].units[0].identifications[0];
                expect(identification.taxon).toBe("Parnassius apollo");
                expect(identification.taxonID).toBe("MX.60724");
                expect(identification.taxonVerbatim).toBe("isoapollo");
                return [2 /*return*/];
            });
        }); });
    });
    describe("Extending form with field with formID", function () {
        var extendedID = "JX.519";
        var form = { fields: [{ formID: extendedID }] };
        var extendedSchemaFormat;
        beforeAll(function () { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, formService.getSchemaFormat(extendedID)];
                    case 1:
                        extendedSchemaFormat = _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        it("return fields and nothing else from extended form", function () { return __awaiter(void 0, void 0, void 0, function () {
            var jsonFormat;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fieldService.masterToSchemaFormat(form, LANG)];
                    case 1:
                        jsonFormat = _a.sent();
                        expect(jsonFormat.schema).toEqual(extendedSchemaFormat.schema);
                        ["options", "id", "title", "shortDescription",
                            "translations", "uiSchema"].forEach(function (prop) {
                            expect(jsonFormat).not.toContain(prop);
                        });
                        return [2 /*return*/];
                }
            });
        }); });
        it("can be patched", function () { return __awaiter(void 0, void 0, void 0, function () {
            var _form, jsonFormat, _enum;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _form = __assign(__assign({}, form), { patch: [
                                {
                                    op: "add",
                                    path: "/fields/1/options/whitelist/-",
                                    value: "MX.secureLevelKM100"
                                },
                            ] });
                        return [4 /*yield*/, fieldService.masterToSchemaFormat(_form, LANG)];
                    case 1:
                        jsonFormat = _a.sent();
                        _enum = jsonFormat.schema.properties.secureLevel["enum"];
                        expect(_enum[_enum.length - 1]).toEqual("MX.secureLevelKM100");
                        return [2 /*return*/];
                }
            });
        }); });
    });
});
