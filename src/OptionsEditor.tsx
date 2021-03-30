import * as React from "react";
import memoize from "memoizee";
import LajiForm from "laji-form/lib/components/LajiForm";
import lajiFormBs3 from "laji-form/lib/themes/bs3";
import ApiClient from "./ApiClientImplementation";
import { Context } from "./Context";
import { Spinner, Modal } from "./components";
import {  Lang, OptionChangeEvent, TranslationsChangeEvent } from "./LajiFormBuilder";
import { translate, JSONSchema, gnmspc, detectChangePaths, parseJSONPointer } from "./utils";
import * as LajiFormUtils from "laji-form/lib/utils";
const { updateSafelyWithJSONPath } = LajiFormUtils;
import { TextareaEditorField } from "./UiSchemaEditor";

interface JSONSchemaEnum {enum: string[]; enumNames: string[]; type: "string";}

const getEnumRange = memoize((apiClient: ApiClient, lang: Lang, enumName: string) =>
	apiClient.fetchJSON(`/metadata/ranges/${enumName}`, {lang}).then((enums: { value: string; id: string; }[]) =>
		enums.reduce<JSONSchemaEnum>((es, e) => (
			{...es, enum: [...es.enum, e.id], enumNames: [...es.enumNames, e.value]}
		), {enum: [""], enumNames: [""], type: "string"})
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
	const [features, setFeatures] = React.useState<JSONSchemaEnum>();
	const [printTypes, setPrintTypes] = React.useState<JSONSchemaEnum>();
	const [viewerTypes, setViewerTypes] = React.useState<JSONSchemaEnum>();
	const [categories, setCategories] = React.useState<JSONSchemaEnum>();
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
	const {str, array, object, bool, enu} = JSONSchema;
	const schema = features && printTypes && viewerTypes && categories && object({
		name: str,
		title: str,
		description: str,
		shortDescription: str,
		logo: str,
		category: enu(categories),
		collectionID: str,
		instructions: object({
			fi: str,
			en: str,
			sv: str,
		}),
		actions: object({
			save: str,
			temp: str,
			cancel: str,
		}),
		language: enu({enum: langs, enumNames: langs}),
		supportedLanguage: array(enu({enum: langs, enumNames: langs}), {uniqueItems: true}),
		printType: enu(printTypes),
		viewerType: enu(viewerTypes),
		features: array(enu(features), {uniqueItems: true}),
		options: object({
			namedPlaceList: array(str),
			messages: object({
				success: str
			}),
			season: object({
				start: str,
				end: str
			}),
			ownSubmissionColumns: array(str),
			ownSubmissionActions: array(str),
			periods: array(str),
			disableRequestDescription: bool,
			hideTES: bool,
			displayOwnSubmissions: bool,
			formPermisionDescription: str
		}),
		namedPlaceOptions: object({
			formID: str,
			description: str,
			createDescription: str,
			useLabel: str,
			startWithMap: bool,
			listLabel: str,
			printLabel: str,
			formNavLabel: str,
			reservationUntil: str,
			showLegentList: bool,
			hideMapTab: bool,
			zoomToData: bool,
			mapTileLayerName: str,
			mapOverlayNames: str,
			createNewLabels: object({
				button: str
			}),
			includeUnits: bool,
			requireAdmin: bool,
			infoFields: array(str),
			birdAssociationAreaHelp: str,
			prepopulatedDocumentFields: array(str),
			documentListUseLocalDocumentViewer: bool,
			documentViewerGatheringGeometryJSONPath: str,
			adminShowCopyLink: bool
		}),
		prepopulatedWithInformalTaxonGroups: array(str),
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
	}, [formData, onChange, options]);
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
						renderSubmit={false}
						onChange={onLajiFormChange}
						fields={fields}
						lang={lang}
						theme={lajiFormBs3}
					/>
				}
			</div>
		</Modal>
	);
});
