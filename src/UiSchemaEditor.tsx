import * as React from "react";
import parsePropTypes from "parse-prop-types";
import memoize from "memoizee";
import JSONEditor from "react-json-editor-ajrm";
import { FieldEditorProps, FieldEditorChangeEvent } from "./LajiFormEditor";
import { Stylable, Classable } from "./components";
import LajiFormInterface from "./LajiFormInterface";
import { propTypesToSchema, getComponentPropTypes, getTranslatedUiSchema, unprefixDeeply, prefixSchemaDeeply, unprefixSchemaDeeply, prefixUiSchemaDeeply } from "./utils";
const LajiForm = require("laji-form/lib/components/LajiForm").default;
import * as LajiFormUtils from "laji-form/lib/utils";
const { parseJSONPointer, parseSchemaFromFormDataPointer, updateSafelyWithJSONPath, isObject } = LajiFormUtils;

export default class UiSchemaEditor extends React.PureComponent<FieldEditorProps & Stylable & Classable> {
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
		return customizeUiSchema(schemaForUiSchema, prefixUiSchemaDeeply(_uiSchema, unprefixSchemaDeeply(schemaForUiSchema, "$"), "$"));
	});

	getFieldName(): string {
		const {uiSchema = {}, field} = this.props;
		if (!field) {
			return "";
		}
		const { "ui:title": uiTitle } = getTranslatedUiSchema(uiSchema, this.props.translations);
		return uiTitle ?? field.label ?? field.name;
	}

	render() {
		if (!this.props.schema) {
			return null;
		}

		const schema = this.getEditorSchema(this.props.uiSchema, this.props.schema, "$");
		const uiSchema = this.getEditorUiSchema(this.props.uiSchema, schema);
		const formData = {
			...getTranslatedUiSchema(this.props.uiSchema, this.props.translations, "$"),
			"$ui:title": this.getFieldName()
		};
		const fields = { TextareaEditorField, UiFieldEditor };
		const formContext = {
			path: this.props.path,
			rootSchema: this.props.schema,
			rootUiSchema: this.props.uiSchema
		};
		return (
			<div style={this.props.style} className={this.props.className}>
				<LajiForm
					schema={schema}
					uiSchema={uiSchema}
					formData={formData}
					onChange={this.onEditorLajiFormChange}
					fields={fields}
					lang={this.props.lang}
					formContext={formContext}
				/>
			</div>
		);
	}

	onEditorLajiFormChange = (eventUiSchema: any) => {
		eventUiSchema = unprefixDeeply(eventUiSchema, "$");
		const viewUiSchema = getTranslatedUiSchema(this.props.uiSchema, this.props.translations);
		const { schema, uiSchema } = this.props;
		const detectChangePaths = (_uiSchema: any, path: string): string[] => {
			if (isObject(_uiSchema)) {
				return Object.keys(_uiSchema).reduce((paths, key) => {
					const changes = detectChangePaths(_uiSchema[key], `${path}/${key}`);
					return changes.length ? [...paths, ...changes] : paths;
				}, []);
			} else if (Array.isArray(_uiSchema)) {
				return _uiSchema.reduce((paths, item, idx) => {
					const changes = detectChangePaths(item, `${path}/${idx}`);
					return changes.length ? [...paths, ...changes] : paths;
				}, []);
			}
			if (parseJSONPointer(eventUiSchema, path) !== parseJSONPointer(viewUiSchema, path)) {
				return [path];
			}
			return [];
		};
		const changedPaths = detectChangePaths(eventUiSchema, "");
		const events: FieldEditorChangeEvent[] = [];
		let newUiSchema = uiSchema;
		changedPaths.forEach(changedPath => {
			const schemaForUiSchema = parseSchemaFromFormDataPointer(unprefixSchemaDeeply(this.getEditorSchema(newUiSchema, schema), "$"), changedPath);
			const currentValue = parseJSONPointer(newUiSchema, changedPath);
			const newValue = parseJSONPointer(eventUiSchema, changedPath);
			if (schemaForUiSchema.type === "string" && !schemaForUiSchema.enum) {
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
			events.push({type: "uiSchema", value: unprefixDeeply(newUiSchema, "$")});
		}
		(events.length) && this.props.onChange(events);
	}
}

const prefixer = (prefix?: string) => (key: string) => prefix ? `${prefix}${key}` : key;

const getEditorSchema = (uiSchema: any, schema: any, prefix?: string): any => {
	const registry = LajiFormInterface.getRegistry();
	const {"ui:field": uiField, "ui:widget": uiWidget} = uiSchema;
	const component = uiField && registry.fields[uiField] || uiWidget && registry.widgets[uiWidget];
	const componentPropTypes = getComponentPropTypes(component);
	const prependPrefix = prefixer(prefix);
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
			: {...schemaForUiSchema, properties: {...schemaForUiSchema.properties, ...forBoth, "$ui:widget": {type: "string"}}}
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
	if ((componentPropTypes || {}).uiSchema) {
		const _schema = propTypesToSchema((componentPropTypes || {}).uiSchema, "$");
		return customize({
			..._schema,
			properties: {
				...defaultProps.properties,
				..._schema.properties
			}
		}, schema, prefix)
	} else {
		return customize(defaultProps, schema, prefix);
	}
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
		schema: (_schema, rootSchema): any => {
			const {type: _type} = rootSchema;
			const _enum = ["", ...Object.keys(LajiFormInterface.getFieldTypes()[_type])];
			return {type: "string", enum: _enum, enumNames: _enum};
		}
	},
	"ui:functions": {
		schema: (_schema: any, rootSchema: any): any => {
			return {type: "array", items: {
				type: "object",
				properties: {
					"ui:field": {type: "string"},
					"ui:options": {type: "object", properties: {}}
				}
			}};
			//const {"ui:functions": uiFunctions} = rootUiSchema;
			//const _enum = ["", ...Object.keys(LajiFormInterface.getFieldTypes()[_type])];
			//return {type: "string", enum: _enum, enumNames: _enum};
		},
		uiSchema:  (): any => {
			return {items: {"ui:field": "UiFieldEditor"}};
		}
	}
};


const customize = (schemaForUiSchema: any, rootSchema: any, prefix?: string): any => {
	if (schemaForUiSchema.properties) {
		return {...schemaForUiSchema, properties: Object.keys(schemaForUiSchema.properties).reduce((properties: any, prop: string): any => {
			let propSchema = schemaForUiSchema.properties[prop];
			const {schema: replace} = customPropTypeSchemaMappings[prop] || {};
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

const customizeUiSchema = (schemaForUiSchema: any, uiSchema: any): any => {
	if (schemaForUiSchema.properties) {
		const propertiesUiSchema = Object.keys(schemaForUiSchema.properties).reduce((properties: any, prop: string): any => {
			const propSchema = schemaForUiSchema.properties[prop];
			const {uiSchema: replace} = customPropTypeSchemaMappings[prop] || {};
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
	const onChange = React.useCallback((({jsObject}: any) => props.onChange(_lajiFormId ? {...jsObject, _lajiFormId} : jsObject)), [props.onChange])
	return  (
		<React.Fragment>
			{label}
			{isObject(value) || Array.isArray(value) ? (
				<JSONEditor
					placeholder={filterLajiFormId(props.formData || props.value)}
					onChange={onChange}
					locale="en"
					height={100}
				/>
			) : (
				<input value={value} />
			)}
		</React.Fragment>
	);
};

const UiFieldEditor = (props: any) => {
	const { SchemaField } = props.registry.fields;

	const schema = customize(props.schema, props.formContext.rootSchema, "$");
	const uiSchema = customize(LajiFormUtils.getInnerUiSchema(props.uiSchema), props.formContext.rootUiSchema, "$");

	return <SchemaField {...props} schema={schema} uiSchema={uiSchema}/>;
};
