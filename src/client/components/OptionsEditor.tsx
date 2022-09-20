import * as React from "react";
import LajiForm from "./LajiForm";
import { Context } from "./Context";
import { Spinner, Classable, Stylable, Clickable } from "./components";
import {  OptionChangeEvent, TranslationsChangeEvent } from "./Builder";
import { PropertyModel, SchemaFormat, Master, PropertyRange, Lang } from "../../model";
import { translate, parseJSONPointer, unprefixProp, multiLang } from "../../utils";
import { detectChangePaths, gnmspc  } from "../utils";
import { TextareaEditorField } from "./UiSchemaEditor";
import _LajiForm, { LajiFormProps } from "laji-form/lib/components/LajiForm";
import { updateSafelyWithJSONPointer } from "laji-form/lib/utils";
import MetadataService from "../../services/metadata-service";

export const mapRangeToUiSchema = async (property: PropertyModel, metadataService: MetadataService, lang: Lang) => {
	const range = property.range[0];

	if (range === "MY.document" || range === PropertyRange.keyValue) {
		return {"ui:field": "TextareaEditorField"};
	}
	if (property.isEmbeddable) {
		const properties = await metadataService.getProperties(range);
		const propertiesUiSchemas = await Promise.all(
			properties.map(p => mapPropertyToUiSchema(p, metadataService, lang))
		);
		return propertiesUiSchemas.reduce(
			(ps, p, i) => ({...ps, [unprefixProp(properties[i].property)]: p}), {}
		);
	}
	return {};
};
const mapComment = (comment: string | undefined, uiSchema: any) => ({...uiSchema, "ui:help": comment});

export const mapPropertyToUiSchema =
	async (property: PropertyModel, metadataService: MetadataService, lang: Lang)
	: Promise<SchemaFormat> =>
		mapComment(multiLang(property.comment, lang), await mapRangeToUiSchema(property, metadataService, lang));

type FormOptionEvent = OptionChangeEvent | TranslationsChangeEvent;
interface FormOptionsEditorProps extends Classable, Stylable {
	master: Master;
	translations: {[key: string]: string};
	onChange: (events: FormOptionEvent | FormOptionEvent[]) => void;
	lajiFormRef?: React.Ref<_LajiForm>;
	onLoaded?: () => void;
	filter?: string[];
	clearFilters: () => void;
}

const formProperty = {
	range: ["MHL.form"],
	property: "MHL.form",
	isEmbeddable: true,
	label: {},
	maxOccurs: "1",
	minOccurs: "1",
	multiLanguage: false,
	shortName: "form",
	required: false,
	domain: []
};

const prepareSchema = (schema: any) => {
	delete schema.properties.fields;
	delete schema.properties.uiSchema;
	delete schema.properties.translations;
	return schema;
};

interface FilterTreeNode {
	[node: string ]: FilterTreeNode | true;
}

const prepareUiSchema = (schema: any, uiSchema: any, filter?: string[]) => {
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

	if (!filter) {
		return uiSchema;
	}

	const doFilter = (schema: any, uiSchema: any, filter: FilterTreeNode) => {
		const getProperties = (schema: any): any => schema.properties || schema.items.properties;
		const properties = getProperties(schema);
		Object.keys(properties).forEach((prop: string) => {
			if (!filter[prop]) {
				uiSchema[prop] = {"ui:field": "HiddenField"};
			}
		});
		Object.keys(filter).forEach(k => {
			if (filter[k] !== true) {
				if (schema.items && !uiSchema.items) {
					uiSchema.items = {};
				}
				if (schema.items) {
					uiSchema = uiSchema.items;
				}
				if (!uiSchema[k]) {
					uiSchema[k] = {};
				}
				doFilter(properties[k], uiSchema[k], filter[k] as FilterTreeNode);
			}
		});
	};

	const filterTree: FilterTreeNode = filter.reduce<FilterTreeNode>((tree, f) => {
		const splits = f.split("/").filter(s => s);
		let treePointer = tree;
		splits.forEach((s, i) => {
			if (i === splits.length - 1) {
				treePointer[s] = true;
			} else {
				if (!treePointer[s]) {
					treePointer[s] = {} as FilterTreeNode;
				}
				treePointer = treePointer[s] as FilterTreeNode;
			}
		});
		return tree;
	}, {});
	doFilter(schema, uiSchema, filterTree);
	
	return uiSchema;
};

const prepareMaster = (master: Master) => {
	const {fields, uiSchema: _uiSchema, translations, ..._master} = master;
	return _master;
};

export default React.memo(React.forwardRef<HTMLDivElement, FormOptionsEditorProps>(function OptionsEditor(
	{master, onChange, translations, className, style, lajiFormRef, onLoaded, filter, clearFilters}
	: FormOptionsEditorProps, ref) {
	const { metadataService, translations: appTranslations, editorLang } = React.useContext(Context);
	const [schema, setModelSchema] = React.useState<null>();
	const [uiSchema, setModelUiSchema] = React.useState<null>();
	React.useEffect(() => {
		(async () => {
			const schema = await metadataService.getJSONSchemaFromProperty(formProperty);
			setModelSchema(prepareSchema(schema));
			setModelUiSchema(prepareUiSchema(
				schema,
				await mapPropertyToUiSchema(formProperty, metadataService, editorLang),
				filter
			));
		})();
	}, [metadataService, filter, editorLang]);
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
					events.push({type: "translations", key: currentValue, value: newValue ?? ""});
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
	let props: LajiFormProps & { ref?: React.Ref<_LajiForm> } = {
		schema,
		uiSchema,
		formData,
		onChange: onLajiFormChange,
		fields: {TextareaEditorField}
	};
	if (lajiFormRef) {
		props.ref = lajiFormRef;
	}

	React.useEffect(() => {
		if (schema && onLoaded) {
			onLoaded();
		}
	}, [schema, onLoaded]);

	const content = (
		!schema
			? <Spinner />
			: <LajiForm {...props} />
	);
	return <div className={className} style={style} ref={ref}>
		{filter?.length && <Clickable className={gnmspc("options-editor-clear")}
		                              onClick={clearFilters}
		                              tag="div"
		>{appTranslations["Editor.options.clear"]}</Clickable>}
		{content}
	</div>;
}));
