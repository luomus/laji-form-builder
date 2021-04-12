import * as React from "react";
import LajiForm from "./LajiForm";
import { Context } from "./Context";
import { Spinner, Modal } from "./components";
import {  OptionChangeEvent, TranslationsChangeEvent } from "./LajiFormBuilder";
import { PropertyModel, PropertyRange } from "./model";
import MetadataService from "./metadata-service";
import { translate, JSONSchema, gnmspc, detectChangePaths, parseJSONPointer } from "./utils";
import * as LajiFormUtils from "laji-form/lib/utils";
const { updateSafelyWithJSONPath } = LajiFormUtils;
import { TextareaEditorField } from "./UiSchemaEditor";

interface Schemas {
	schema: any;
	uiSchema: any;
}

const mapRangeToSchema = (property: Pick<PropertyModel, "range" | "isEmbeddable" | "multiLanguage">, metadataService: MetadataService): Promise<Schemas> => {
	const range = property.range[0];
	if (range.match(/Enum$/)) {
		return metadataService.getRange(range).then(enums => ({schema: {type: "string", enum: enums}, uiSchema: {}}));
	}
	if (property.multiLanguage) {
		return Promise.resolve({schema: JSONSchema.object(["fi", "sv", "en"].reduce((props, lang) => ({...props, [lang]: {type: "string"}}), {})), uiSchema: {}});
	}

	let schema, uiSchema = {};
	switch (range) {
	case PropertyRange.String:
		schema = JSONSchema.str;
		break;
	case PropertyRange.Boolean:
		schema = JSONSchema.bool;
		break;
	case PropertyRange.NonNegativeInteger:
	case PropertyRange.PositiveInteger:
		schema = JSONSchema.integer;
		break;
	case PropertyRange.keyValue:
	case PropertyRange.keyAny:
	case "MY.document":
		schema = JSONSchema.object();
		uiSchema = {"ui:field": "TextareaEditorField"};
		break;
	default:
		if (!property.isEmbeddable) {
			schema = JSONSchema.str;
		} else {
			return metadataService.getProperties(range).then(_model => propertiesToSchema(_model, metadataService));
		}
	}
	return Promise.resolve({schema, uiSchema});
};
const mapMaxOccurs = (maxOccurs: string, schema: any): Promise<Schemas> => maxOccurs === "unbounded" ? JSONSchema.array(schema) : schema;

const mapComment = (comment: string | undefined, uiSchema: any) => ({...uiSchema, "ui:help": comment});
const mapLabel = (label: string | undefined, schema: any) => ({...schema, title: label});

const mapPropertyToSchemas = ({label, comment, range, maxOccurs, multiLanguage, isEmbeddable}: Pick<PropertyModel, "label" | "comment" | "range" | "maxOccurs" | "multiLanguage" | "isEmbeddable">, metadataService: MetadataService): Promise<Schemas> =>
	(mapRangeToSchema({range, isEmbeddable, multiLanguage}, metadataService)).then(schemas => ({
		schema: mapLabel(label, mapMaxOccurs(maxOccurs, schemas.schema)),
		uiSchema: mapComment(comment, schemas.uiSchema)
	}));

const propertiesToSchema = (modelProperties: PropertyModel[], metadataService: MetadataService): Promise<Schemas> => Promise.all(modelProperties.map(m => mapPropertyToSchemas(m, metadataService).then(schemas => ({property: m.shortName, schemas}))))
	.then(propertiesAndSchemas => ({
		schema: JSONSchema.object(propertiesAndSchemas.reduce((properties, {property, schemas: {schema}}) => ({...properties, [property]: schema}), {})),
		uiSchema: propertiesAndSchemas.reduce((_uiSchema, {property, schemas: {uiSchema}}) => ({..._uiSchema, [property]: uiSchema}), {})
	}));

type FormOptionEvent = OptionChangeEvent | TranslationsChangeEvent;
interface FormOptionsEditorProps {
	onClose: () => void;
	options: any;
	onChange: (events: FormOptionEvent | FormOptionEvent[]) => void;
}

const formProperty = {range: ["MHL.formOptionsClass"], isEmbeddable: true, label: "", comment: "", maxOccurs: "1", multiLanguage: false};

export default React.memo(function OptionsEditor({onClose, options, onChange}: FormOptionsEditorProps) {
	const { metadataService, theme: { Modal }, translations } = React.useContext(Context);
	const [schema, setModelSchema] = React.useState<any[]>();
	const [uiSchema, setModelUiSchema] = React.useState<any[]>();
	React.useEffect(() => {
		mapPropertyToSchemas(formProperty, metadataService).then(({schema, uiSchema}) => {
			setModelSchema(schema);
			setModelUiSchema(uiSchema);
		});
	}, [metadataService]);
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
	return (
		<Modal onClose={onClose}>
			<div style={{width: 500}} className={gnmspc("field-editor")}>
				{!schema
					? <Spinner />
					: <LajiForm
						schema={schema}
						uiSchema={uiSchema}
						formData={formData}
						onChange={onLajiFormChange}
						fields={{TextareaEditorField}}
					/>
				}
			</div>
		</Modal>
	);
});
