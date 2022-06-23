import * as React from "react";
import parsePropTypes from "parse-prop-types";
import memoize from "memoizee";
import { FieldEditorProps, FieldEditorChangeEvent } from "./Editor";
import LajiFormInterface from "../LajiFormInterface";
import {
	propTypesToSchema, getComponentPropTypes, getTranslatedUiSchema, unprefixDeeply, prefixSchemaDeeply,
	unprefixSchemaDeeply, prefixUiSchemaDeeply, unprefixer, detectChangePaths, 
} from "../utils";
import { parseJSONPointer, JSONSchema } from "../../utils";
import LajiForm from "./LajiForm";
import { Label as LajiFormLabel } from "laji-form/lib/components/components";
import LajiFormTitle from "laji-form/lib/components/fields/TitleField";
import { parseSchemaFromFormDataPointer, updateSafelyWithJSONPointer, isObject, getInnerUiSchema, getUiOptions,
	isEmptyString, immutableDelete } from "laji-form/lib/utils";
import { JSONEditor } from "./components";
import { Context } from "./Context";
import { FieldProps } from "@rjsf/core";

const PREFIX = "$";

const unprefix = unprefixer(PREFIX);

const LabelWithoutPrefix = React.memo((props: any) => <LajiFormLabel {...props} label={unprefix(props.label ?? "")} />);
const TitleWithoutPrefix = React.memo((props: any) => <LajiFormTitle {...props} title={unprefix(props.title ?? "")} />);

export default class UiSchemaEditor extends React.PureComponent<FieldEditorProps> {
	static contextType = Context;
	context!: React.ContextType<typeof Context>;

	static defaultProps = {
		uiSchema: {}
	};
	getEditorSchema = memoize(getEditorSchema);
	getEditorUiSchema = memoize((uiSchema: any, schemaForUiSchema: any): any => {
		const registry = LajiFormInterface.getRegistry();
		const {"ui:field": uiField, "ui:widget": uiWidget} = uiSchema;
		const component = uiField && registry.fields[uiField] || uiWidget && registry.widgets[uiWidget];
		const componentPropTypes = component && parsePropTypes(component);
		const propTypesForUiSchema = (propTypes: any): any => {
			const name = propTypes.name || (propTypes.type || {}).name;
			const value = propTypes.value || (propTypes.type || {}).value;
			let itemUiSchema;
			switch (name) {
			case "shape":
				return Object.keys(value).reduce((properties: any, prop) => {
					const propUiSchema = propTypesForUiSchema(value[prop]);
					if (Object.keys(propUiSchema).length) {
						properties[prop] = propUiSchema;
					}
					return properties;
				}, {});
			case "arrayOf":
				 itemUiSchema = propTypesForUiSchema(value);
				return Object.keys(itemUiSchema).length
					? {items: itemUiSchema}
					: {};
			case "string":
			case "number":
			case "oneOf":
			case "bool":
				return {};
			default:
				return {["ui:field"]: "TextareaEditorField"};
			}
		};
		const _uiSchema = (componentPropTypes || {}).uiSchema
			? propTypesForUiSchema((componentPropTypes || {}).uiSchema)
			: {};
		return customizeUiSchema(
			schemaForUiSchema,
			prefixUiSchemaDeeply(_uiSchema, unprefixSchemaDeeply(schemaForUiSchema, PREFIX), PREFIX)
		);
	});

	normalizeUiSchema(uiSchema: any, prefix = ""): any {
		const key = `${prefix}ui:title`;
		const getFieldName = () => {
			const {field} = this.props;
			if (!field) {
				return "";
			}
			const uiTitle = uiSchema[key];
			return (uiTitle ?? (field.label ?? undefined)) || undefined;
		};
		const uiTitle = getFieldName();
		return uiTitle === undefined
			? uiSchema
			: {
				...uiSchema,
				[key]: getFieldName()
			};
	}

	render() {
		if (!this.props.schema) {
			return null;
		}

		const schema = this.getEditorSchema(this.props.uiSchema, this.props.schema, PREFIX);
		const uiSchema = this.getEditorUiSchema(this.props.uiSchema, schema);
		const formData = getTranslatedUiSchema(
			this.normalizeUiSchema(this.props.uiSchema, PREFIX),
			this.props.translations,
			PREFIX,
			this.getEditorSchema(this.props.uiSchema, this.props.schema)
		);
		const formContext = {
			path: this.props.path,
			rootSchema: this.props.schema,
			rootUiSchema: this.props.uiSchema
		};
		return (
			<EditorLajiForm
				schema={schema}
				uiSchema={uiSchema}
				formData={formData}
				onChange={this.onEditorLajiFormChange}
				formContext={formContext}
			/>
		);
	}

	onEditorLajiFormChange = (eventUiSchema: any) => {
		eventUiSchema = unprefixDeeply(eventUiSchema, PREFIX);
		const viewUiSchema = this.normalizeUiSchema(
			getTranslatedUiSchema(this.props.uiSchema, this.props.translations)
		);
		const { schema, uiSchema } = this.props;
		const changedPaths = detectChangePaths(eventUiSchema, viewUiSchema);
		const events: FieldEditorChangeEvent[] = [];
		let newUiSchema = this.normalizeUiSchema(uiSchema);
		changedPaths.forEach(changedPath => {
			const schemaForUiSchema = parseSchemaFromFormDataPointer(
				unprefixSchemaDeeply(this.getEditorSchema(newUiSchema, schema), PREFIX),
				changedPath
			);
			const currentValue = parseJSONPointer(newUiSchema, changedPath);
			const newValue = parseJSONPointer(eventUiSchema, changedPath);

			if (schemaForUiSchema?.type === "string" && !schemaForUiSchema?.enum) {
				const doConfirm = () => !confirm(this.context.translations["editor.confirmDontTranslate"]);

				if (newValue === undefined) {
					if (currentValue?.[0] === "@") {
						events.push({type: "translations", op: "delete", key: currentValue});
					}
					newUiSchema = immutableDelete(newUiSchema, changedPath);
				} else if (currentValue?.[0] === "@") {
					events.push({type: "translations", key: currentValue, value: newValue ?? ""});
				} else {
					const translationKey =  `@${this.props.path}${changedPath}`;
					if (isEmptyString(currentValue)) {
						events.push({type: "translations", key: translationKey, value: newValue});
						newUiSchema = updateSafelyWithJSONPointer(newUiSchema, newValue, changedPath);
					} else if (doConfirm()) {
						newUiSchema = updateSafelyWithJSONPointer(newUiSchema, translationKey, changedPath);
						events.push(
							{
								type: "translations",
								op: "add",
								key: translationKey,
								value: ["fi", "sv", "en"].reduce((byLang, lang) => ({
									...byLang,
									[lang]: lang === this.context.editorLang ? newValue : currentValue
								}), {})
							});
					} else {
						newUiSchema = updateSafelyWithJSONPointer(newUiSchema, newValue, changedPath);
					}
				}
			} else {
				newUiSchema = updateSafelyWithJSONPointer(newUiSchema, newValue, changedPath);
			}
		});
		if (newUiSchema !== uiSchema) {
			events.push({type: "uiSchema", value: unprefixDeeply(newUiSchema, PREFIX)});
		}
		(events.length) && this.props.onChange(events);
	}
}

const prefixer = (prefix?: string) => (key: string) => prefix ? `${prefix}${key}` : key;

const getEditorSchema = (uiSchema: any, schema: any, prefix?: string): any => {
	const prependPrefix = prefixer(prefix);
	const registry = LajiFormInterface.getRegistry();
	const {"ui:field": uiField, "ui:widget": uiWidget} = uiSchema;
	const component = uiField && registry.fields[uiField] || uiWidget && registry.widgets[uiWidget];
	const componentPropTypes = getComponentPropTypes(component);
	const forBoth = {
		[prependPrefix("ui:field")]: JSONSchema.String(),
		[prependPrefix("ui:functions")]: JSONSchema.array(
			JSONSchema.object({
				[prependPrefix("ui:field")]: JSONSchema.String(),
				[prependPrefix("ui:options")]: JSONSchema.object()
			})
		)
	};
	const addWidgetOrField = ((schemaForUiSchema: any, _schema: any) =>
		(_schema.type === "object" || _schema.type === "array")
			? {...schemaForUiSchema, properties: {...schemaForUiSchema.properties, ...forBoth}}
			: {
				...schemaForUiSchema,
				properties: {
					...schemaForUiSchema.properties,
					...forBoth,
					[prependPrefix("ui:widget")]: JSONSchema.String()
				}
			}
	);
	const defaultProps = addWidgetOrField({
		type: "object",
		properties: {
			[prependPrefix("ui:title")]: JSONSchema.String(),
			[prependPrefix("ui:description")]: JSONSchema.String(),
			[prependPrefix("ui:help")]: JSONSchema.String(),
			[prependPrefix("className")]: JSONSchema.String()
		}
	}, schema);
	let editorSchema;
	if (componentPropTypes?.uiSchema) {
		const _schema = propTypesToSchema(componentPropTypes?.uiSchema, prefix);
		editorSchema = customize({
			..._schema,
			properties: {
				...defaultProps.properties,
				..._schema.properties
			}
		}, schema, prefix);
	} else {
		editorSchema = customize(defaultProps, schema, prefix);
	}
	if (schema.type === "array") {
		const itemsEditorSchema = getEditorSchema(uiSchema.items || {}, schema.items, prefix);
		if (itemsEditorSchema) {
			editorSchema = {
				...editorSchema,
				properties: {
					...editorSchema.properties,
					[prependPrefix("items")]: itemsEditorSchema
				}
			};
		}
	}
	return editorSchema;
};

const customPropTypeSchemaMappings: {
	[propName: string]: {
		schema?: (schema: any, rootSchema: any) => any,
		uiSchema?: (schema: any) => any
	}
} = {
	"ui:widget": {
		schema: (_schema, rootSchema: any): any => {
			const {type: _type} = rootSchema;
			const _enum = ["", ...Object.keys(LajiFormInterface.getWidgetTypes()[_type])];
			return JSONSchema.enu({enum: _enum, enumNames: _enum});
		}
	},
	"ui:field": {
		schema: (): any => {
			const {object, array, string} = LajiFormInterface.getFieldTypes();
			const _enum = ["", ...Object.keys({...object, ...array, ...string})];
			return JSONSchema.enu({enum: _enum, enumNames: _enum});
		}
	},
	"ui:functions": {
		schema: (): any => {
			return JSONSchema.array(
				JSONSchema.object({
					"ui:field": JSONSchema.String(),
					"ui:options": JSONSchema.object()
				})
			);
		},
		uiSchema: (): any => {
			return {items: {"ui:field": "UiFieldEditor"}};
		}
	},
};

const customize = (schemaForUiSchema: any, rootSchema: any, prefix?: string): any => {
	const rmPrefix = unprefixer(prefix);
	if (schemaForUiSchema.properties) {
		return {
			...schemaForUiSchema,
			properties: Object.keys(schemaForUiSchema.properties).reduce((properties: any, prop: string): any => {
				let propSchema = schemaForUiSchema.properties[prop];
				const {schema: replace} = customPropTypeSchemaMappings[rmPrefix(prop)] || {};
				if (replace) {
					propSchema = prefixSchemaDeeply(replace(schemaForUiSchema.properties[prop], rootSchema), prefix);
				}
				return {...properties, [prop]: customize(propSchema, rootSchema, prefix)};
			}, {})
		};
	} else if (schemaForUiSchema.type === "array" && schemaForUiSchema.items.properties) {
		return {
			...schemaForUiSchema,
			items: {
				...schemaForUiSchema.items,
				properties: Object.keys(schemaForUiSchema.items.properties).reduce((properties, prop) => ({
					...properties,
					[prop]: customize(schemaForUiSchema.items.properties[prop], rootSchema, prefix)
				}), {})
			}
		};
	}
	return schemaForUiSchema;
};

const customizeUiSchema = (schemaForUiSchema: any, uiSchema: any, prefix = PREFIX): any => {
	const rmPrefix = unprefixer(prefix);
	if (schemaForUiSchema.properties) {
		const propertiesUiSchema = Object.keys(schemaForUiSchema.properties).reduce(
			(properties: any, prop: string): any => {
				const propSchema = schemaForUiSchema.properties[prop];
				const {uiSchema: replace} = customPropTypeSchemaMappings[rmPrefix(prop)] || {};
				let propUiSchema = properties[prop];
				if (replace) {
					propUiSchema = replace(schemaForUiSchema.properties[prop]);
				}
				propUiSchema = customizeUiSchema(propSchema, propUiSchema);
				if (Object.keys(propUiSchema || {}).length) {
					return {...properties, [prop]: propUiSchema};
				}
				return properties;
			}, uiSchema || {});
		if (Object.keys(propertiesUiSchema).length) {
			return propertiesUiSchema;
		}
	} else if (schemaForUiSchema.type === "array" && schemaForUiSchema.items.properties) {
		const itemsUiSchema = Object.keys(schemaForUiSchema.items.properties).reduce((properties, prop) => {
			const propUiSchema = customizeUiSchema(
				schemaForUiSchema.items.properties[prop],
				uiSchema?.items?.items?.[prop]
			);
			if (Object.keys(propUiSchema || {}).length) {
				return {...properties, [prop]: propUiSchema};
			}
			return properties;
		}, (uiSchema || {}).items || {});
		if (Object.keys(itemsUiSchema).length) {
			return {
				...uiSchema, items: itemsUiSchema
			};
		}
		return uiSchema;
	}
};

export const TextareaEditorField = (props: FieldProps) => {
	const label = props.label || props.title || props.name;
	const value = props.formData ?? props.value;
	let _lajiFormId: any;
	const filterLajiFormId = (_value: any) => {
		if (isObject(_value) && _value._lajiFormId) {
			const {_lajiFormId: lajiFormId, ...remaining} = _value;
			_lajiFormId = lajiFormId;
			return remaining;
		}
		return _value;
	};
	const _onChange = props.onChange;
	const onChange = React.useCallback(((value: any) => (
		_onChange(_lajiFormId
			? {...value, _lajiFormId}
			: value)
	)), [_onChange, _lajiFormId]);
	const { minRows, maxRows, rows } = getUiOptions(props.uiSchema);
	const {Label} = props.formContext;
	return (
		<React.Fragment>
			<Label label={label} />
			<JSONEditor
				value={filterLajiFormId(value)}
				onChange={onChange}
				resizable={isObject(value) || Array.isArray(value)}
				rows={rows}
				minRows={minRows}
				maxRows={maxRows}
			/>
		</React.Fragment>
	);
};

const UiFieldEditor = (props: any) => {
	const { SchemaField } = props.registry.fields;

	const schema = customize(props.schema, props.formContext.rootSchema, PREFIX);
	const uiSchema = customize(getInnerUiSchema(props.uiSchema), props.formContext.rootUiSchema, PREFIX);

	return <SchemaField {...props} schema={schema} uiSchema={uiSchema}/>;
};

export const EditorLajiForm = (props: any) => {
	const fields = { TextareaEditorField, UiFieldEditor, Label: LabelWithoutPrefix, TitleField: TitleWithoutPrefix };
	return <LajiForm fields={fields} {...props} />;
};
