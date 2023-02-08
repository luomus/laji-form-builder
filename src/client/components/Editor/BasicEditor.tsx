import * as React from "react";
import {
	FieldEditorProps, FieldEditorChangeEvent, GenericEditorContent
} from "./Editor";
import {
	unprefixProp, translate, JSONSchemaBuilder, parseJSONPointer, getRootProperty, getRootField
} from "../../../utils";
import * as LajiFormUtils from "laji-form/lib/utils";
const { dictionarify, updateSafelyWithJSONPointer } = LajiFormUtils;
import { Context } from "../Context";
import LajiForm from "../LajiForm";
import { Spinner } from "../components";
import { EditorLajiForm } from "./UiSchemaEditor";
import { Property, Field, JSONSchema, isJSONSchemaEnumOneOf } from "../../../model";
import { detectChangePaths } from "../../utils";

type BasicEditorState = {
	childProps?: Property[] | false;
	// Resets LajiForm so we get empty formData upon change.
	lajiFormToucher: number;
};

type RelevantFields = Pick<Field, "validators" | "warnings">;

export default class BasicEditor extends React.PureComponent<FieldEditorProps, BasicEditorState> {
	documentTree: any;
	propertyContextAbortController: AbortController;

	static contextType = Context;
	context!: React.ContextType<typeof Context>;

	state = {
		lajiFormToucher: 0
	} as BasicEditorState;

	constructor(props: FieldEditorProps) {
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
			<GenericEditorContent json={this.getFormDataFromProps()}
			                      onJSONChange={this.onLajiFormChange}
			                      renderUI={this.renderUI} />
		);
	}

	renderUI() {
		return (
			<div className={this.props.className}>
				{this.renderAdder()}
				{this.renderOptionsAndValidations()}
			</div>
		);
	}

	renderAdder = () => {
		if (this.state.childProps) {
			const existing = dictionarify(this.props.field.fields || [], (field: Field) => field.name);
			const [enums, enumNames] = this.state.childProps
				.filter(p => !existing[unprefixProp(p.property)])
				.reduce<[string[], string[]]>(([_enums, _enumNames], prop) => {
					_enums.push(prop.property);
					_enumNames.push(`${prop.property} (${prop.label[this.context.lang]})`);
					return [_enums, _enumNames];
				}, [[], []]);
			if (enums.length === 0) {
				return null;
			}
			const schema = JSONSchemaBuilder.enu(
				{enum: enums, enumNames},
				{title: this.context.translations.AddProperty}
			);
			return (
				<LajiForm
					key={this.state.lajiFormToucher}
					schema={schema}
					onChange={this.onAddProperty}
				/>
			);
		} else if (this.state.childProps === false) {
			return null;
		} else {
			return <div><Spinner /></div>;
		}
	}

	onAddProperty = (property: string): void => {
		if (!property) {
			return;
		}
		const propertyModel = (this.state.childProps as Property[])
			.find(childProp => childProp.property === property);
		if (propertyModel) {
			this.setState({lajiFormToucher: this.state.lajiFormToucher + 1});
			this.props.onChange([{type: "field", op: "add", value: propertyModel}]);
		}
	}

	propertyModelToField(property?: Property) {
		if (!property) {
			throw new Error("Tried to add nonexisting property");
		}
		return property;
	}

	getFormData({options, validators, warnings}: Pick<Field, "options" | "validators" | "warnings">) {
		return (Object.keys({ options, validators, warnings }) as (keyof RelevantFields)[])
			.reduce<RelevantFields>((formData, key) => {
				if (this.props.field[key] !== undefined) {
					formData[key] = this.props.field[key];
				}
				return formData;
			}, {});
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
		let newFormData = formData;
		const changedPaths = detectChangePaths(viewFormData, newFormData);
		changedPaths.forEach(changedPath => {
			const currentValue = parseJSONPointer(newFormData, changedPath);
			const newValue = parseJSONPointer(viewFormData, changedPath);
			if (typeof currentValue === "string") {
				if (currentValue[0] === "@") {
					events.push({type: "translations", key: currentValue, value: newValue});
				} else {
					const translationKey =  `@${this.props.path}${changedPath}`;
					newFormData = updateSafelyWithJSONPointer(newFormData, translationKey, changedPath);
					events.push({type: "translations", key: translationKey, value: newValue});
				}
			} else {
				newFormData = updateSafelyWithJSONPointer(newFormData, newValue, changedPath);
			}
		});
		if (newFormData !== formData) {
			events.push({type: "field", op: "update", value: {...this.props.field, ...newFormData}});
		}
		(events.length) && this.props.onChange(events);
	}
}
