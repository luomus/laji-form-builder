import memoize from "memoizee";
import LajiForm from "laji-form/lib/components/LajiForm";
import RJSF from "@rjsf/core";
import validator from "@rjsf/validator-ajv6";
import { Field, Widget } from "@rjsf/utils";
import { getComponentPropTypes, propTypesToSchema } from "./utils";

class _LajiFormInterface {
	getRegistry = memoize((): ({
		fields: {[field: string]: Field},
		widgets: {[field: string]: Widget}
	}) => {
		const lajiForm = new LajiForm({schema: {}, uiSchema: {}});
		return (new RJSF({
			schema: {},
			uiSchema: {},
			fields: lajiForm.getFields(),
			widgets: lajiForm.getWidgets(),
			validator
		})as any).getRegistry();
	})

	walkTypesToComponents = memoize(<T>(registryFields: {[fieldName: string]: T})
		: {[fieldType: string]: {[fieldName: string]: true}} =>
			Object.keys(registryFields).reduce((types, field) => {
				const _componentPropTypes = getComponentPropTypes(registryFields[field]);
				const _schema = propTypesToSchema((_componentPropTypes || {}).schema || {});
				const _ = (fieldTypes: string[]) => fieldTypes.reduce((_fieldTypes, fieldType) => ({
					..._fieldTypes, [fieldType]: {...(_fieldTypes[fieldType] || {}), [field]: true}
				}), types);
				if (_schema && _schema.type === "object" && _schema.properties.type && _schema.properties.type.enum) {
					return _(_schema.properties.type.enum);
				}
				//console.warn(`${field} doesn't have schema type in prop types set"`)
				return _(["unknown"]);
			}, {} as any))

	getFieldTypes = () => this.walkTypesToComponents<Field>(this.getRegistry().fields);
	getWidgetTypes = () => this.walkTypesToComponents<Widget>(this.getRegistry().widgets);
}
const LajiFormInterface = new _LajiFormInterface();
export  default LajiFormInterface;
