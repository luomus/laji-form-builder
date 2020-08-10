import * as React from "react";
import memoize from "memoizee";
const LajiForm = require("laji-form/lib/components/LajiForm").default;
import ApiClient from "./ApiClientImplementation";
import { Context } from "./Context";
import { Spinner, Modal } from "./components";
import {  Lang, OptionChangeEvent, TranslationsChangeEvent } from "./LajiFormBuilder";
import { translate, JSONSchema, gnmspc, detectChangePaths, parseJSONPointer } from "./utils";
import * as LajiFormUtils from "laji-form/lib/utils";
const { updateSafelyWithJSONPath } = LajiFormUtils;
import { TextareaEditorField } from "./UiSchemaEditor";

const getEnumRange = memoize((apiClient: ApiClient, lang: Lang, enumName: string) =>
	apiClient.fetchJSON(`/metadata/ranges/${enumName}`, {lang}).then((enums: { value: string; id: string; }[]) =>
		enums.reduce((es, e) => (
			{enum: [...es.enum, e.id], enumNames: [...es.enumNames, e.value]}
		), {enum: [""], enumNames: [""]})
	));

type FormOptionEvent = OptionChangeEvent | TranslationsChangeEvent;
interface FormOptionsEditorProps {
	onClose: () => void;
	options: any;
	translations: any;
	onChange: (events: FormOptionEvent | FormOptionEvent[]) => void;
}

export default React.memo(function OptionsEditor({onClose, options, translations, onChange}: FormOptionsEditorProps) {
	const { lang, apiClient } = React.useContext(Context);
	const [features, setFeatures] = React.useState();
	const [printTypes, setPrintTypes] = React.useState();
	const [viewerTypes, setViewerTypes] = React.useState();
	const [categories, setCategories] = React.useState();
	const langs = ["fi", "en", "sv"];
	React.useEffect(() => {
		if (!apiClient || !lang) {
			return;
		}
		getEnumRange(apiClient, lang, "MHL.featureEnum").then(setFeatures);
		getEnumRange(apiClient, lang, "MHL.printTypeEnum").then(setPrintTypes);
		getEnumRange(apiClient, lang, "MHL.viewerTypeEnum").then(setViewerTypes);
		getEnumRange(apiClient, lang, "MHL.categoryEnum").then(setCategories);
	}, [apiClient, lang]);
	const {string, array, object, boolean, enu} = JSONSchema;
	const schema = features && printTypes && viewerTypes && categories && object({
		name: string,
		title: string,
		description: string,
		shortDescription: string,
		logo: string,
		category: enu(categories),
		collectionID: string,
		instructions: object({
			fi: string,
			en: string,
			sv: string,
		}),
		actions: object({
			save: string,
			temp: string,
			cancel: string,
		}),
		language: enu({enum: langs, enumNames: langs}),
		supportedLanguage: array(enu({enum: langs, enumNames: langs}), {uniqueItems: true}),
		printType: enu(printTypes),
		viewerType: enu(viewerTypes),
		features: array(enu(features), {uniqueItems: true}),
		options: object({
			namedPlaceList: array(string),
			messages: object({
				success: string
			}),
			season: object({
				start: string,
				end: string
			}),
			ownSubmissionColumns: array(string),
			ownSubmissionActions: array(string),
			periods: array(string),
			disableRequestDescription: boolean,
			hideTES: boolean,
			displayOwnSubmissions: boolean,
			formPermisionDescription: string
		}),
		namedPlaceOptions: object({
			formID: string,
			description: string,
			createDescription: string,
			useLabel: string,
			startWithMap: boolean,
			listLabel: string,
			printLabel: string,
			formNavLabel: string,
			reservationUntil: string,
			showLegentList: boolean,
			hideMapTab: boolean,
			zoomToData: boolean,
			mapTileLayerName: string,
			mapOverlayNames: string,
			createNewLabels: object({
				button: string
			}),
			includeUnits: boolean,
			requireAdmin: boolean,
			infoFields: array(string),
			birdAssociationAreaHelp: string,
			prepopulatedDocumentFields: array(string),
			documentListUseLocalDocumentViewer: boolean,
			documentViewerGatheringGeometryJSONPath: string,
			adminShowCopyLink: boolean
		}),
		prepopulatedWithInformalTaxonGroups: array(string),
		prepopulatedDocument: object({})
	});
	const scopeField = (fields: string[] = []) => ({
		"ui:field": "ScopeField",
		"ui:options": {
			fields,
			includeAdditionalFieldsChooserButton: true
		}
	});
	const uiSchema = {
		...scopeField(),
		prepopulatedDocument: {
			"ui:field": "TextareaEditorField", "ui:options": { minRows: 5 }
		},
		options: scopeField(),
		namedPlaceOptions: scopeField()
	};
	const formData = translate(options, translations);
	const onLajiFormChange = React.useCallback((viewFormData) => {
		const changedPaths = detectChangePaths(viewFormData, formData);
		let newFormData = options;
		const events: FormOptionEvent[] = [];
		changedPaths.forEach(changedPath => {
			const currentValue = parseJSONPointer(newFormData, changedPath);
			const newValue = parseJSONPointer(viewFormData, changedPath);
			if (typeof currentValue === "string") {
				if (currentValue[0] === "@") {
					events.push({type: "translations", key: currentValue, value: newValue});
				} else {
					const translationKey =  `@${changedPath}`;
					newFormData = updateSafelyWithJSONPath(newFormData, translationKey, changedPath);
					events.push({type: "translations", key: translationKey, value: newValue});
					events.push({type: "options", value: translationKey, path: changedPath});
				}
			} else {
				events.push({type: "options", value: newValue, path: changedPath});
			}
		});
		onChange(events);
	}, [options, translations]);
	const fields = { TextareaEditorField };
	return (
		<Modal onClose={onClose}>
			<div style={{width: 500}} className={gnmspc("field-editor")}>
				{!schema
					? <Spinner />
					: <LajiForm
						schema={schema}
						uiSchema={uiSchema}
						formData={formData}
						apiClient={apiClient}
						renderSubmit={false}
						onChange={onLajiFormChange}
						fields={fields}
						lang={lang}
					/>
				}
			</div>
		</Modal>
	);
});
