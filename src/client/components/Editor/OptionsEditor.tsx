import * as React from "react";
import LajiForm from "../LajiForm";
import { Context } from "../Context";
import { Spinner, Stylable, Button } from "../components";
import {  OptionChangeEvent, TranslationsChangeEvent } from "../../services/change-handler-service";
import {
	Property, SchemaFormat, Master, PropertyRange, Lang, JSONObject, JSONSchema, isJSONSchemaObject, isJSONObject
} from "../../../model";
import { translate, parseJSONPointer, unprefixProp, multiLang } from "../../../utils";
import { detectChangePaths, gnmspc, handleTranslationChange } from "../../utils";
import { isDefaultData, updateSafelyWithJSONPointer } from "@luomus/laji-form/lib/utils";
import { TextareaEditorField } from "./UiSchemaEditor";
import { LajiFormProps } from "@luomus/laji-form/lib/components/LajiForm";
import MetadataService from "../../../services/metadata-service";
import { editorContentNmspc, EditorContentTab, EditorToolbar, GenericEditorContent } from "./Editor";

export const mapRangeToUiSchema = async (property: Property, metadataService: MetadataService, lang: Lang) => {
	const range = property.range[0];

	if (range === "MY.document" || range === PropertyRange.keyValue) {
		return {"ui:field": "TextareaEditorField"};
	}
	if (property.isEmbeddable) {
		const properties = await metadataService.getPropertiesForEmbeddedProperty(range);
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
	async (property: Property, metadataService: MetadataService, lang: Lang)
	: Promise<JSONObject> =>
		mapComment(multiLang(property.comment, lang), await mapRangeToUiSchema(property, metadataService, lang));

type FormOptionEvent = OptionChangeEvent | TranslationsChangeEvent;
export type FormOptionsEditorProps = Stylable & {
	master: Master;
	translations: {[key: string]: string};
	onChange: (events: FormOptionEvent | FormOptionEvent[]) => void;
	onLoaded?: () => void;
	filter?: string[];
	clearFilters: () => void;
	topOffset?: number;
	activeTab?: EditorContentTab;
	onTabChange: (tab: EditorContentTab) => void;
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

const prepareUiSchema = (
	schema: JSONSchema,
	uiSchema: JSONObject,
	formData: JSONObject,
	filter?: string[],
	displayOnlyUsed = false
) => {
	uiSchema["ui:order"] = [
		"name",
		"title",
		"description",
		"shortDescription",
		"baseFormID",
		"fieldsFormID",
		"collectionID",
		"category",
		"logo",
		"options",
		"*"
	];

	const doFilter = (schema: JSONSchema, uiSchema: JSONObject, formData?: JSONObject, filter?: FilterTreeNode) => {
		if (!filter && !displayOnlyUsed) {
			return;
		}
		const properties = isJSONSchemaObject(schema) ? schema.properties : undefined;
		properties && Object.keys(properties).forEach((prop: string) => {
			if ((filter && !filter[prop]) || (displayOnlyUsed && isDefaultData(formData?.[prop], properties[prop]))) {
				uiSchema[prop] = {"ui:field": "HiddenField"};
			}
			if (!uiSchema[prop]) {
				uiSchema[prop] = {};
			}
			doFilter(
				properties[prop],
				uiSchema[prop] as JSONObject,
				formData?.[prop] as JSONObject | undefined,
				filter?.[prop] as FilterTreeNode
			);
		});
	};

	const filterTree = filter?.reduce<FilterTreeNode>((tree, f) => {
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

	doFilter(schema, uiSchema, formData, filterTree);
	
	return uiSchema;
};

const prepareMaster = (master: Master) => {
	const {fields, uiSchema, translations, id, "@context": storeContext, "@type": storeType, ..._master} = master;
	return _master;
};

export default React.memo(React.forwardRef<HTMLDivElement, FormOptionsEditorProps>(function OptionsEditor(
	{master, onChange, translations, onLoaded, filter, clearFilters, topOffset = 0, activeTab = "JSON", onTabChange}
	: FormOptionsEditorProps, ref) {
	const context = React.useContext(Context);
	const { metadataService, translations: appTranslations, editorLang } = context;
	const [schema, setModelSchema] = React.useState<SchemaFormat>();
	const [uiSchema, setModelUiSchema] = React.useState<JSONObject>();
	const [displayOnlyUsed, setDisplayOnlyUsed] = React.useState(false);
	const toggleSetDisplayOnlyUsed = React.useCallback(
		() => setDisplayOnlyUsed(!displayOnlyUsed),
		[displayOnlyUsed, setDisplayOnlyUsed]
	);

	const _master = React.useMemo(() => prepareMaster(master), [master]);
	const formData = React.useMemo(() => translate(_master, translations), [_master, translations]);

	React.useEffect(() => {
		(async () => {
			const schema = await metadataService.getJSONSchemaFromProperty(formProperty);
			setModelSchema(prepareSchema(schema));
			setModelUiSchema(prepareUiSchema(
				schema,
				await mapPropertyToUiSchema(formProperty, metadataService, editorLang),
				formData as JSONObject,
				filter,
				displayOnlyUsed
			));
		})();
	}, [metadataService, filter, editorLang, displayOnlyUsed, formData]);

	const onLajiFormChange = React.useCallback((viewFormData) => {
		const changedPaths = detectChangePaths(viewFormData, formData);
		let newFormData = _master;
		const events: FormOptionEvent[] = [];
		changedPaths.forEach(changedPath => {
			const currentValue = parseJSONPointer(newFormData, changedPath);
			const newValue = parseJSONPointer(viewFormData, changedPath);
			if (typeof currentValue === "string" || typeof newValue === "string") {
				newFormData = handleTranslationChange(
					newFormData,
					events,
					"",
					changedPath,
					context,
					currentValue,
					newValue,
				);
				events.push({type: "options", value: parseJSONPointer(newFormData, changedPath), path: changedPath});
			} else {
				newFormData = updateSafelyWithJSONPointer(newFormData, newValue, changedPath);
				events.push({type: "options", value: newValue, path: changedPath});
			}
		});
		onChange(events);
	}, [formData, onChange, _master, context]);

	let props: LajiFormProps = React.useMemo(() => ({
		schema,
		uiSchema,
		formData,
		onChange: onLajiFormChange,
		fields: {TextareaEditorField},
	}), [schema, uiSchema, formData, onLajiFormChange]);

	React.useEffect(() => {
		if (schema && onLoaded) {
			onLoaded();
		}
	}, [schema, onLoaded]);

	const content = React.useCallback(() => {
		const _content = 
		!schema
			? <Spinner />
			: (
				<div style={{height: "100%", overflow: "auto"}}
				     className={editorContentNmspc("ui")} >
					<LajiForm {...props} />
				</div>
			);
		return <>
			<EditorToolbar>
				<Button onClick={toggleSetDisplayOnlyUsed} active={displayOnlyUsed} small>
					{appTranslations["editor.options.displayOnlyUsed"]}
				</Button>
				{filter?.length && <Button small
				                           variant="danger"
				                           onClick={clearFilters}
				>{appTranslations["editor.options.clear"]}</Button>}
			</EditorToolbar>
			{_content}
		</>;
	}, [schema, props, toggleSetDisplayOnlyUsed, displayOnlyUsed, appTranslations, filter?.length, clearFilters]);

	const getJSON = React.useCallback(() => formData, [formData]);

	return  (
		<div className={gnmspc("options-editor")} ref={ref} style={{width: "100%"}}>
			<GenericEditorContent json={getJSON()}
			                      onJSONChange={onLajiFormChange}
			                      validator={isJSONObject}
			                      renderUI={content}
			                      activeTab={activeTab}
			                      onTabChange={onTabChange}
			                      overflowUIContent={false}
			                      topOffset={(activeTab === "JSON" ? 46 : 73) + topOffset} />
		</div>
	);
}));
