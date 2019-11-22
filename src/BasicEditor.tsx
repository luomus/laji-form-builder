import * as React from "react";
import { FieldEditorProps, FieldEditorChangeEvent, FieldOptions } from "./LajiFormEditor";
import { PropertyModel, PropertyRange } from "./LajiFormBuilder";
import { Stylable, Classable, Button } from "./components";
import { fetchJSON, makeCancellable, CancellablePromise, unprefixProp } from "./utils";
import * as LajiFormUtils from "laji-form/lib/utils";
const { dictionarify } = LajiFormUtils;
import { Context } from "./Context";
import memoize from "memoizee";
const SelectWidget = require("laji-form/lib/components/widgets/SelectWidget").default;
const LajiForm = require("laji-form/lib/components/LajiForm").default;

interface PropertyContext {
	"@id": string;
	"@type": PropertyRange;
	"@container"?: "@set";
}

interface BasicEditorState {
	childProps?: PropertyModel[];
}

export default class BasicEditor extends React.PureComponent<FieldEditorProps, BasicEditorState> {
	documentTree: any;
	// TODO why is void required?
	propertyContextPromise: CancellablePromise<PropertyContext | void>;
	propertyChildsPromise: CancellablePromise<PropertyModel[] | void>

	static contextType = Context;

	state = {} as BasicEditorState;

	componentDidMount() {
		this.propertyContextPromise = makeCancellable(this.getPropertyContextForPath(this.props.path).then(({"@container": container}) => {
			if (container === "@set") {
				this.propertyChildsPromise = makeCancellable(this.getProperties(this.props.path).then(properties => {
					this.setState({childProps: properties});
				}));
			}
		}));
	}

	componentWillUnmount() {
		this.propertyContextPromise?.cancel();
		this.propertyChildsPromise?.cancel();
	}

	render() {
		if (this.state.childProps) {
			const existing = dictionarify(this.props.field.fields as FieldOptions[], (field: FieldOptions) => field.name);
			const [enums, enumNames] = this.state.childProps
				.filter(s => !existing[unprefixProp(s.property)])
				.reduce<[string[], string[]]>(([_enums, _enumNames], prop) => {
					_enums.push(prop.property);
					_enumNames.push(`${prop.property} (${prop.label})`);
					return [_enums, _enumNames];
				}, [[], []]);
			const schema = {
				title: this.context.translations.AddProperty,
				type: "string",
				enum: enums,
				enumNames
			};
			return (
				<LajiForm
					schema={schema}
					onChange={this.onAddProperty}
					lang={this.context.lang}
					renderSubmit={false}
				/>
			);
		}
		return "TODO (kenttien piilottaminen, järjestys?)";
	}

	onAddProperty = (property: string, b: any): void => {
		const propertyModel = (this.state.childProps as PropertyModel[]).find(childProp => childProp.property === property);
		console.log("ON ADD", property, b);
		console.log(this.propertyModelToFieldOptions(propertyModel));
		if ((propertyModel as PropertyModel).range.includes(PropertyRange.String)) {
			this.props.onChange([{type: "field", op: "add", value: propertyModel as PropertyModel}]);
			//return {
			//	name: property.shortName
			//}
		}
	}

	propertyModelToFieldOptions(property?: PropertyModel) {
		if (!property) {
			throw new Error("Tried to add nonexisting property")
		}
		return property;
	}

	getPropertiesContext = memoize(() => fetchJSON("http://schema.laji.fi/context/document.jsonld").then(result => result["@context"]))

	getMedataPropertyName(context: {[property: string]: PropertyContext}, property: string): PropertyContext {
		if (property === "gatherings") {
			return context.gathering;
		}
		return context[property];
	}

	getPropertyContextForPath(path: string): Promise<PropertyContext> {
		return new Promise((resolve, reject) =>
			this.getPropertiesContext().then(propertiesContext => {
				const splits = path.split("/");
				const propertyContext = propertiesContext[splits[splits.length - 1]];
				resolve(propertyContext);
			}, reject)
		);
	}

	getPropertyNameFromContext(propertyContext: PropertyContext) {
		let id = propertyContext["@id"]
		id = id.replace("http://tun.fi/", "");
		if (id === "MY.gatherings") {
			return  "MY.gathering";
		}
		return id;
	}

	getProperties = memoize((path: string): Promise<PropertyModel[]> => {
		return new Promise((resolve, reject) => {
			this.getPropertyContextForPath(path).then(propertyContext =>
				this.context.apiClient.fetchJSON(`/metadata/classes/${this.getPropertyNameFromContext(propertyContext)}/properties`).then(
					(r: any) => resolve(r.results),
					reject
				)
			)
		});
	})
}
