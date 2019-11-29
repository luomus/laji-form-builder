import * as React from "react";
import parsePropTypes from "parse-prop-types";
import memoize from "memoizee";
import { FieldEditorProps, FieldEditorChangeEvent } from "./LajiFormEditor";
import LajiFormInterface from "./LajiFormInterface";
import { propTypesToSchema, getComponentPropTypes, getTranslatedUiSchema, prefixDeeply, unprefixDeeply, prefixSchemaDeeply, unprefixSchemaDeeply, prefixUiSchemaDeeply, unprefixer, getTranslation } from "./utils";
const LajiForm = require("laji-form/lib/components/LajiForm").default;
const {Label: LajiFormLabel } = require("laji-form/lib/components/components");
const LajiFormTitle = require("laji-form/lib/components/fields/TitleField").default;
import * as LajiFormUtils from "laji-form/lib/utils";
const { parseJSONPointer, parseSchemaFromFormDataPointer, updateSafelyWithJSONPath, isObject, getInnerUiSchema } = LajiFormUtils;
import { JSONEditor } from "./components"

const PREFIX = "$";

const unprefix = unprefixer(PREFIX);

const LabelWithoutPrefix = React.memo((props: any) => <LajiFormLabel {...props} label={unprefix(props.label)} />);
const TitleWithoutPrefix = React.memo((props: any) => <LajiFormTitle {...props} title={unprefix(props.title)} />);

export default class UiSchemaEditor extends React.PureComponent<FieldEditorProps> {
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
				const itemUiSchema = propTypesForUiSchema(value);
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
		const _uiSchema = (componentPropTypes || {}).uiSchema ? propTypesForUiSchema((componentPropTypes || {}).uiSchema) : {};
		return customizeUiSchema(schemaForUiSchema, prefixUiSchemaDeeply(_uiSchema, unprefixSchemaDeeply(schemaForUiSchema, PREFIX), PREFIX));
	});

	getFieldName(): string {
		const {uiSchema = {}, field, translations} = this.props;
		if (!field) {
			return "";
		}
		const { "ui:title": uiTitle } = getTranslatedUiSchema(uiSchema, this.props.translations);
		return (uiTitle ?? getTranslation(field.label || "", translations)) || "";
	}

	render() {
		if (!this.props.schema) {
			return null;
		}

		const schema = this.getEditorSchema(this.props.uiSchema, this.props.schema, PREFIX);
		const uiSchema = this.getEditorUiSchema(this.props.uiSchema, schema);
		const formData = {
			...getTranslatedUiSchema(this.props.uiSchema, this.props.translations, PREFIX, this.getEditorSchema(this.props.uiSchema, this.props.schema)),
			[`${PREFIX}ui:title`]: this.getFieldName()
		};
		const fields = { TextareaEditorField, UiFieldEditor, Label: LabelWithoutPrefix, TitleField: TitleWithoutPrefix };
		const formContext = {
			path: this.props.path,
			rootSchema: this.props.schema,
			rootUiSchema: this.props.uiSchema
		};
		return (
			<LajiForm
				schema={schema}
				uiSchema={uiSchema}
				formData={formData}
				onChange={this.onEditorLajiFormChange}
				lang={this.context.lang}
				formContext={formContext}
				fields={fields}
			/>
		);
	}

	onEditorLajiFormChange = (eventUiSchema: any) => {
		eventUiSchema = unprefixDeeply(eventUiSchema, PREFIX);
		const viewUiSchema = getTranslatedUiSchema(this.props.uiSchema, this.props.translations);
		const { schema, uiSchema } = this.props;
		const detectChangePaths = (_uiSchema: any, _viewUiSchema: any, path: string): string[] => {
			if (isObject(_uiSchema)) {
				if (!isObject(_viewUiSchema)) {
					return [path];
				}
				return Object.keys(_uiSchema).reduce((paths, key) => {
					const changes = detectChangePaths(_uiSchema[key], _viewUiSchema[key], `${path}/${key}`);
					return changes.length ? [...paths, ...changes] : paths;
				}, []);
			} else if (Array.isArray(_uiSchema) || Array.isArray(_viewUiSchema)) {
				if (!_viewUiSchema || !_uiSchema || _uiSchema.length !== _viewUiSchema.length) {
					return [path];
				}
				return _uiSchema.reduce((paths: string[], item: any, idx: number) => {
					const changes = detectChangePaths(item, _viewUiSchema[idx], `${path}/${idx}`);
					return changes.length ? [...paths, ...changes] : paths;
				}, []);
			}
			if (parseJSONPointer(eventUiSchema, path) !== parseJSONPointer(viewUiSchema, path)) {
				return [path];
			}
			return [];
		};
		const changedPaths = detectChangePaths(eventUiSchema, viewUiSchema, "");
		const events: FieldEditorChangeEvent[] = [];
		let newUiSchema = uiSchema;
		changedPaths.forEach(changedPath => {
			const schemaForUiSchema = parseSchemaFromFormDataPointer(unprefixSchemaDeeply(this.getEditorSchema(newUiSchema, schema), PREFIX), changedPath);
			const currentValue = parseJSONPointer(newUiSchema, changedPath);
			const newValue = parseJSONPointer(eventUiSchema, changedPath);
			if (schemaForUiSchema?.type === "string" && !schemaForUiSchema?.enum) {
				if (currentValue?.[0] === "@") {
					events.push({type: "translations", key: currentValue, value: newValue});
				} else {
					const translationKey =  `@${this.props.path}${changedPath}`;
					newUiSchema = updateSafelyWithJSONPath(newUiSchema, translationKey, changedPath);
					events.push({type: "translations", key: translationKey, value: newValue});
				}
			} else {
				newUiSchema = updateSafelyWithJSONPath(newUiSchema, newValue, changedPath);
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
		[prependPrefix("ui:field")]: {type: "string"},
		[prependPrefix("ui:functions")]: {
			type: "array",
			items: {
				type: "object",
				properties: {
					[prependPrefix("ui:field")]: {type: "string"},
					[prependPrefix("ui:options")]: {type: "object", properties: {}}
				}
			}
		}
	};
	const addWidgetOrField = ((schemaForUiSchema: any, _schema: any) =>
		(_schema.type === "object" || _schema.type === "array")
			? {...schemaForUiSchema, properties: {...schemaForUiSchema.properties, ...forBoth}}
			: {...schemaForUiSchema, properties: {...schemaForUiSchema.properties, ...forBoth, [prependPrefix("ui:widget")]: {type: "string"}}}
	);
	const defaultProps = addWidgetOrField({
		type: "object",
		properties: {
			[prependPrefix("ui:title")]: { type: "string", },
			[prependPrefix("ui:description")]: { type: "string", },
			[prependPrefix("ui:help")]: { type: "string", },
			[prependPrefix("className")]: { type: "string", }
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
			return {type: "string", enum: _enum, enumNames: _enum};
		}
	},
	"ui:field": {
		schema: (): any => {
			const {object, array} = LajiFormInterface.getFieldTypes();
			const _enum = ["", ...Object.keys({...object, ...array})];
			return {type: "string", enum: _enum, enumNames: _enum};
		}
	},
	"ui:functions": {
		schema: (): any => {
			return {type: "array", items: {
				type: "object",
				properties: {
					"ui:field": {type: "string"},
					"ui:options": {type: "object", properties: {}}
				}
			}};
		},
		uiSchema: (): any => {
			return {items: {"ui:field": "UiFieldEditor"}};
		}
	},
};

const customize = (schemaForUiSchema: any, rootSchema: any, prefix?: string): any => {
	const rmPrefix = unprefixer(prefix);
	if (schemaForUiSchema.properties) {
		return {...schemaForUiSchema, properties: Object.keys(schemaForUiSchema.properties).reduce((properties: any, prop: string): any => {
			let propSchema = schemaForUiSchema.properties[prop];
			const {schema: replace} = customPropTypeSchemaMappings[rmPrefix(prop)] || {};
			if (replace) {
				propSchema = prefixSchemaDeeply(replace(schemaForUiSchema.properties[prop], rootSchema), prefix);
			}
			return {...properties, [prop]: customize(propSchema, rootSchema, prefix)};
		}, {})};
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
		const propertiesUiSchema = Object.keys(schemaForUiSchema.properties).reduce((properties: any, prop: string): any => {
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
			const propUiSchema = customizeUiSchema(schemaForUiSchema.items.properties[prop], (((uiSchema || {}).items || {}).items || {})[prop]);
			if (Object.keys(propUiSchema || {}).length) {
				return {...properties, [prop]: propUiSchema};
			}
			return properties;
		}, (uiSchema || {}).items || {});
		if (Object.keys(itemsUiSchema).length) {
			return {
				...uiSchema, items: itemsUiSchema
			}
		}
		return uiSchema;
	}
};

const TextareaEditorField = (props: any) => {
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
	const onChange = React.useCallback(((value: any) => (
		props.onChange(_lajiFormId
			? {...value, _lajiFormId}
			: value)
	)), [props.onChange]);
	return (
		<React.Fragment>
			<LajiFormLabel label={label} />
			<JSONEditor
				value={filterLajiFormId(value)}
				onChange={onChange}
				resizable={isObject(value) || Array.isArray(value)}
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
