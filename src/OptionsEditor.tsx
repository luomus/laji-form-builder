import * as React from "react";
import LajiForm from "./LajiForm";
import { Context } from "./Context";
import { Spinner, Classable, Stylable } from "./components";
import {  OptionChangeEvent, TranslationsChangeEvent } from "./LajiFormBuilder";
import { PropertyModel, Schemas, Master } from "./model";
import { translate, detectChangePaths, parseJSONPointer } from "./utils";
import * as LajiFormUtils from "laji-form/lib/utils";
const { updateSafelyWithJSONPointer } = LajiFormUtils;
import { TextareaEditorField } from "./UiSchemaEditor";

export const mapRangeToUiSchema = (property: Pick<PropertyModel, "property" | "range" | "isEmbeddable" | "multiLanguage">) => {
	const range = property.range[0];

	return range === "MY.document"
		? {"ui:field": "TextareaEditorField"}
		: {};
};
const mapComment = (comment: string | undefined, uiSchema: any) => ({...uiSchema, "ui:help": comment});

export const mapPropertyToUiSchema = ({property, comment, range, multiLanguage, isEmbeddable}: Pick<PropertyModel, "property" | "comment" | "range" | "multiLanguage" | "isEmbeddable">): Promise<Schemas> =>
	mapComment(comment, mapRangeToUiSchema({property, range, isEmbeddable, multiLanguage}));

type FormOptionEvent = OptionChangeEvent | TranslationsChangeEvent;
interface FormOptionsEditorProps extends Classable, Stylable {
	master: Master;
	translations: {[key: string]: string};
	onChange: (events: FormOptionEvent | FormOptionEvent[]) => void;
}

const formProperty = {range: ["MHL.form"], property: "MHL.form", isEmbeddable: true, label: "", comment: "", maxOccurs: "1", multiLanguage: false, shortName: "form"};

const prepareSchema = (schema: any) => {
	delete schema.properties.fields;
	delete schema.properties.uiSchema;
	delete schema.properties.translations;
	return schema;
};

const prepareUiSchema = (uiSchema: any) => {
	uiSchema["ui:order"] = [
		"name",
		"title",
		"description",
		"shortDescription",
		"collectionID",
		"category",
		"logo",
		"options",
		"*"
	];
	return uiSchema;
};

const prepareMaster = (master: Master) => {
	const {fields, uiSchema: _uiSchema, translations, ..._master} = master; // eslint-disable-line @typescript-eslint/no-unused-vars
	return _master;
};

export default React.memo(function OptionsEditor({master, onChange, translations, className, style}: FormOptionsEditorProps) {
	const { metadataService } = React.useContext(Context);
	const [schema, setModelSchema] = React.useState<any[]>();
	const [uiSchema, setModelUiSchema] = React.useState<any[]>();
	React.useEffect(() => {
		metadataService.getJSONSchemaFromProperty(formProperty).then(schema => {
			setModelSchema(prepareSchema(schema));
			setModelUiSchema(prepareUiSchema(mapPropertyToUiSchema(formProperty)));
		});
	}, [metadataService]);
	const _master = prepareMaster(master);
	const formData = translate(_master, translations);
	const onLajiFormChange = React.useCallback((viewFormData) => {
		const changedPaths = detectChangePaths(viewFormData, formData);
		let newFormData = _master;
		const events: FormOptionEvent[] = [];
		changedPaths.forEach(changedPath => {
			const currentValue = parseJSONPointer(newFormData, changedPath);
			const newValue = parseJSONPointer(viewFormData, changedPath);
			if (typeof currentValue === "string") {
				if (currentValue[0] === "@") {
					events.push({type: "translations", key: currentValue, value: newValue});
				} else {
					const translationKey =  `@${changedPath}`;
					newFormData = updateSafelyWithJSONPointer(newFormData, translationKey, changedPath);
					events.push({type: "translations", key: translationKey, value: newValue});
					events.push({type: "options", value: translationKey, path: changedPath});
				}
			} else {
				events.push({type: "options", value: newValue, path: changedPath});
			}
		});
		onChange(events);
	}, [formData, onChange, _master]);
	return (
		!schema
			? <Spinner />
			: (
				<div className={className} style={style}>
					<LajiForm schema={schema}
				              uiSchema={uiSchema}
				              formData={formData}
				              onChange={onLajiFormChange}
				              fields={{TextareaEditorField}}
					/>
				</div>
			)
	);
});
