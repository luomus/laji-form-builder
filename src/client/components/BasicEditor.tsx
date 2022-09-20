import * as React from "react";
import { FieldEditorProps, FieldEditorChangeEvent } from "./Editor";
import { unprefixProp, translate, JSONSchemaBuilder, parseJSONPointer, getPropertyContextName } from "../../utils";
import * as LajiFormUtils from "laji-form/lib/utils";
const { dictionarify, updateSafelyWithJSONPointer } = LajiFormUtils;
import { Context } from "./Context";
import LajiForm from "./LajiForm";
import { Spinner } from "./components";
import { EditorLajiForm } from "./UiSchemaEditor";
import { PropertyModel, PropertyRange, PropertyContext, Field } from "../../model";
import { CancellablePromise, detectChangePaths, makeCancellable } from "../utils";

interface BasicEditorState {
	childProps?: PropertyModel[] | false;
	// Resets LajiForm so we get empty formData upon change.
	lajiFormToucher: number;
}

export default class BasicEditor extends React.PureComponent<FieldEditorProps, BasicEditorState> {
	documentTree: any;
	// TODO why is void required?
	propertyContextPromise: CancellablePromise<PropertyContext | void>;
	propertyChildsPromise: CancellablePromise<PropertyModel[] | void>;

	static contextType = Context;
	context!: React.ContextType<typeof Context>;

	state = {
		lajiFormToucher: 0
	} as BasicEditorState;

	componentDidMount() {
		this.propertyContextPromise = makeCancellable(
			this.getPropertyContextForPath(this.props.path).then(({"@container": container}) => {
				if (container === "@set") {
					this.propertyChildsPromise = makeCancellable(
						this.getProperties(this.props.path).then(properties => {
							this.setState({childProps: properties});
						}));
				} else {
					this.setState({childProps: false});
				}
			}));
	}

	componentWillUnmount() {
		this.propertyContextPromise?.cancel();
		this.propertyChildsPromise?.cancel();
	}

	render() {
		return (
			<React.Fragment>
				{this.renderAdder()}
				{this.renderOptionsAndValidations()}
				{"TODO (kenttien piilottaminen, järjestys?)"}
			</React.Fragment>
		);
	}

	renderAdder = () => {
		if (this.state.childProps) {
			const existing = dictionarify(this.props.field.fields || [], (field: Field) => field.name);
			const [enums, enumNames] = this.state.childProps
				.filter(s => !existing[unprefixProp(s.property)])
				.reduce<[string[], string[]]>(([_enums, _enumNames], prop) => {
					_enums.push(prop.property);
					_enumNames.push(`${prop.property} (${prop.label})`);
					return [_enums, _enumNames];
				}, [[], []]);
			const schema = JSONSchemaBuilder.enu({enum: enums, enumNames}, {title: this.context.translations.AddProperty});
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
			return <Spinner />;
		}
	}

	onAddProperty = (property: string): void => {
		if (!property) {
			return;
		}
		const propertyModel = (this.state.childProps as PropertyModel[])
			.find(childProp => childProp.property === property);
		if (propertyModel) {
			this.setState({lajiFormToucher: this.state.lajiFormToucher + 1});
			this.props.onChange([{type: "field", op: "add", value: propertyModel}]);
		}
	}

	propertyModelToField(property?: PropertyModel) {
		if (!property) {
			throw new Error("Tried to add nonexisting property");
		}
		return property;
	}

	getPropertyContextForPath(path: string): Promise<PropertyContext> {
		const context = getPropertyContextName(this.props.context);
		if (path === "/") {
			return Promise.resolve({
				"@id": `http://tun.fi/${context}`,
				"@container": "@set"
			});
		}
		const propertyName = path.split("/").pop() as string;
		return new Promise((resolve, reject) =>
			this.context.metadataService.getPropertiesContextFor(unprefixProp(context))
				.then((propertiesContext) => { // TODO why is any needed?
					resolve(propertiesContext[propertyName]);
				}, reject)
		);
	}

	getProperties = (path: string): Promise<PropertyModel[]> =>
		this.getPropertyContextForPath(path)
			.then(context => this.context.metadataService.getProperties(context, this.context.lang));

	renderOptionsAndValidations = () => {
		const {options, validators, warnings} = this.props.field;
		const schemaTypeToJSONSchemaUtilType = (type: string) =>
			type === "boolean" && "Boolean"
			|| type === "string" && "String"
			|| type === "array" && "object"
			|| type === "integer" && "Integer"
			|| type;

		const maybePrimitiveDefault = (JSONSchemaBuilder as any)[schemaTypeToJSONSchemaUtilType(this.props.schema.type)]?.();
		const _default = typeof maybePrimitiveDefault !== "function"
			? maybePrimitiveDefault
			: JSONSchemaBuilder.object({});
		const optionsProps: any = {
			excludeFromCopy: JSONSchemaBuilder.Boolean(),
			default: _default
		};
		const {enum: _enum, enumNames} = this.props.schema;
		if (this.props.schema.enum) {
			const list = JSONSchemaBuilder.array(JSONSchemaBuilder.enu({enum: _enum, enumNames}), {uniqueItems: true});
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
			warnings: itemUiSchema
		};
		if ((schema as any)?.properties.options.properties.default.type === "object") {
			uiSchema.options = {default: itemUiSchema};
		}
		const formData = { options, validators, warnings };
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
		const {options, validators, warnings} = this.props.field;
		const formData = { options, validators, warnings };
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
