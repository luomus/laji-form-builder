import memoize from "memoizee";
const LajiForm = require("laji-form/lib/components/LajiForm").default;
const RJSF = require("react-jsonschema-form").default;
import { getComponentPropTypes, propTypesToSchema } from "./utils";

class _LajiFormInterface {
	lajiForm: any;
	rjsf: any;

	getRegistry = memoize((): ({
		fields: {[field: string]: React.Component},
		widgets: {[field: string]: React.Component}
	}) => {
		const lajiForm = new LajiForm({schema: {}, uiSchema: {}, apiClient: {}});
		return new RJSF({
			schema: {},
			uiSchema: {},
			fields: lajiForm.getFields(),
			widgets: lajiForm.getWidgets()
		}).getRegistry();
	})

	walkTypesToComponents = memoize((registryFields: {[fieldName: string]: React.Component})
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
			console.warn(`${field} doesn't have schema type in prop types set"`)
			return _(["unknown"]);
		}, {} as any))

	getFieldTypes = () => this.walkTypesToComponents(this.getRegistry().fields);
	getWidgetTypes = () => this.walkTypesToComponents(this.getRegistry().widgets);
}
const LajiFormInterface = new _LajiFormInterface();
export  default LajiFormInterface;
