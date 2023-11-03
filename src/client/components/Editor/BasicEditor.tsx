import * as React from "react";
import { FieldEditorChangeEvent, GenericEditorContent } from "./Editor";
import {
	unprefixProp, translate, JSONSchemaBuilder, parseJSONPointer, getRootProperty, getRootField
} from "../../../utils";
import * as LajiFormUtils from "@luomus/laji-form/lib/utils";
const { updateSafelyWithJSONPointer } = LajiFormUtils;
import { Context } from "../Context";
import { EditorLajiForm } from "./UiSchemaEditor";
import { Property, Field, JSONSchema, isJSONSchemaEnumOneOf, isJSONObjectOrUndefined } from "../../../model";
import { detectChangePaths, handleTranslationChange } from "../../utils";
import { GenericFieldEditorProps } from "./FieldEditor";
import { immutableDelete } from "@luomus/laji-form/lib/utils";

type BasicEditorState = {
	childProps?: Property[] | false;
	// Resets LajiForm so we get empty formData upon change.
	lajiFormToucher: number;
};

type RelevantFields = Pick<Field, "options" | "validators" | "warnings">;
const relevantFields: (keyof RelevantFields)[] = ["options", "validators", "warnings"];

export default class BasicEditor extends React.PureComponent<GenericFieldEditorProps, BasicEditorState> {
	documentTree: any;
	propertyContextAbortController: AbortController;

	static contextType = Context;
	context!: React.ContextType<typeof Context>;

	state = {
		lajiFormToucher: 0
	} as BasicEditorState;

	constructor(props: GenericFieldEditorProps) {
		super(props);
		this.getFormDataFromProps = this.getFormDataFromProps.bind(this);
		this.onLajiFormChange = this.onLajiFormChange.bind(this);
		this.renderUI = this.renderUI.bind(this);
	}

	componentDidMount() {
		this.propertyContextAbortController = new AbortController();
		this.getProperties(this.props.path, this.propertyContextAbortController.signal).then(properties =>  
			this.setState({childProps: properties.length ? properties : false})
		);
	}

	async getProperties(path: string, signal: AbortSignal): Promise<Property[]> {
		const getPropertyFromSubPathAndProp = async (path: string, property: Property): Promise<Property> => {
			const splitted = path.substr(1).split("/");
			const [cur, ...rest] = splitted;
			if (splitted.length === 1) {
				return property;
			}
			const properties = property.isEmbeddable
				? await this.context.metadataService.getPropertiesForEmbeddedProperty(
					property.range[0],
					undefined,
					signal)
				: [];

			const nextProperty = properties?.find(p => unprefixProp(p.property) === rest[0]);
			if (!nextProperty) {
				throw new Error("Couldn't find property " + cur);
			}
			return getPropertyFromSubPathAndProp("/" + rest.join("/"), nextProperty);
		};
		const property = await getPropertyFromSubPathAndProp(
			`/${this.props.context || "document"}${path.length === 1 ? "" : path}`,
			getRootProperty(getRootField({context: this.props.context}))
		);

		if (property.isEmbeddable) {
			return await this.context.metadataService.getPropertiesForEmbeddedProperty(property.range[0]);
		} else {
			return [];
		}
	}

	componentWillUnmount() {
		this.propertyContextAbortController?.abort();
	}

	render() {
		return (
			<GenericEditorContent json={this.getJSONEditorFormData()}
			                      onJSONChange={this.onLajiFormChange}
			                      validator={isJSONObjectOrUndefined}
			                      renderUI={this.renderUI}
			                      topOffset={68 + (this.props.topOffset || 0)} />
		);
	}

	renderUI() {
		return (
			<div className={this.props.className}>
				{this.renderOptionsAndValidations()}
			</div>
		);
	}

	propertyModelToField(property?: Property) {
		if (!property) {
			throw new Error("Tried to add nonexisting property");
		}
		return property;
	}

	getFormData({required, options, validators, warnings}
		: Pick<Field, "required" | "options" | "validators" | "warnings">) {
		return (Object.keys({ required, options, validators, warnings }) as (keyof RelevantFields)[])
			.reduce<Partial<RelevantFields> | undefined>((formData, key) => {
				if (this.props.field[key] !== undefined) {
					if (!formData) {
						formData = {};
					}
					(formData as any)[key] = this.props.field[key];
				}
				return formData;
			}, undefined);
	}

	getJSONEditorFormData() {
		return translate(this.getFormDataFromProps(), this.props.translations);
	}

	getFormDataFromProps() {
		return this.getFormData(this.props.field);
	}

	renderOptionsAndValidations = () => {
		const schemaTypeToJSONSchemaUtilType = (type: string) =>
			type === "boolean" && "Boolean"
			|| type === "string" && "String"
			|| type === "array" && "object"
			|| type === "integer" && "Integer"
			|| type;

		const JSB = (JSONSchemaBuilder as any);
		const maybePrimitiveDefault = JSB[schemaTypeToJSONSchemaUtilType(this.props.schema.type)]?.();
		const _default = typeof maybePrimitiveDefault !== "function"
			? maybePrimitiveDefault
			: JSONSchemaBuilder.object({});
		const optionsProps: Record<string, JSONSchema> = {
			excludeFromCopy: JSONSchemaBuilder.Boolean(),
			default: _default
		};
		if (isJSONSchemaEnumOneOf(this.props.schema)) {
			const {oneOf} = this.props.schema; 
			const list = JSONSchemaBuilder.array(JSONSchemaBuilder.String({oneOf}), {uniqueItems: true});
			optionsProps.whitelist = list;
			optionsProps.blacklist = list;
		}
		const schema = JSONSchemaBuilder.object({
			required: JSONSchemaBuilder.Boolean(),
			options: JSONSchemaBuilder.object(optionsProps, {title: ""}),
			validators: JSONSchemaBuilder.object({}),
			warnings: JSONSchemaBuilder.object({}),
		});
		const itemUiSchema = { "ui:field": "TextareaEditorField", "ui:options": { minRows: 5 } };
		const uiSchema: any = {
			validators: itemUiSchema,
			warnings: itemUiSchema,
			excludeFromCopy: {},
			default: {}
		};
		if ((schema as any)?.properties.options.properties.default.type === "object") {
			uiSchema.options = {default: itemUiSchema};
		}
		const formData = this.getFormData(this.props.field);
		return (
			<EditorLajiForm
				schema={schema}
				uiSchema={uiSchema}
				formData={translate(formData, this.props.translations)}
				onChange={this.onLajiFormChange}
			/>
		);
	}

	onLajiFormChange = (viewFormData: any) => {
		const events: FieldEditorChangeEvent[] = [];
		const formData = this.getFormDataFromProps();
		const changedPaths = detectChangePaths(viewFormData, formData);
		const newFormData = changedPaths.reduce((newFormData, changedPath) => {
			const currentValue = parseJSONPointer(formData, changedPath);
			const newValue = parseJSONPointer(viewFormData, changedPath);
			if (typeof currentValue === "string" || typeof newValue === "string") {
				return handleTranslationChange(
					newFormData,
					events,
					"",
					changedPath,
					this.context,
					currentValue,
					newValue,
				);
			} else {
				return updateSafelyWithJSONPointer(newFormData, newValue, changedPath);
			}
		}, formData);
		if (newFormData !== formData) {
			if (!newFormData) {
				const cleared = relevantFields.reduce((field, prop) => immutableDelete(field, prop), this.props.field);
				events.push({type: "field", op: "update", value: cleared});
			} else {
				events.push({type: "field", op: "update", value: {...this.props.field, ...newFormData}});
			}
		}
		(events.length) && this.props.onChange(events);
	}
}
