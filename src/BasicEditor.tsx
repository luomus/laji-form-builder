import * as React from "react";
import { FieldEditorProps, FieldEditorChangeEvent, FieldOptions } from "./LajiFormEditor";
import { PropertyModel, PropertyRange } from "./LajiFormBuilder";
import { fetchJSON, makeCancellable, CancellablePromise, unprefixProp, translate, detectChangePaths, JSONSchema } from "./utils";
import * as LajiFormUtils from "laji-form/lib/utils";
const { dictionarify, parseJSONPointer, updateSafelyWithJSONPath } = LajiFormUtils;
import { Context } from "./Context";
import memoize from "memoizee";
const SelectWidget = require("laji-form/lib/components/widgets/SelectWidget").default;
const LajiForm = require("laji-form/lib/components/LajiForm").default;
import { Spinner } from "./components";
import { EditorLajiForm } from "./UiSchemaEditor";

interface PropertyContext {
	"@id": string;
	"@type"?: PropertyRange;
	"@container"?: "@set";
}

interface BasicEditorState {
	childProps?: PropertyModel[] | false;
	// Resets LajiForm so we get empty formData upon change.
	lajiFormToucher: number;
}

export default class BasicEditor extends React.PureComponent<FieldEditorProps, BasicEditorState> {
	documentTree: any;
	// TODO why is void required?
	propertyContextPromise: CancellablePromise<PropertyContext | void>;
	propertyChildsPromise: CancellablePromise<PropertyModel[] | void>

	static contextType = Context;

	state = {
		lajiFormToucher: 0
	} as BasicEditorState;

	componentDidMount() {
		this.propertyContextPromise = makeCancellable(this.getPropertyContextForPath(this.props.path).then(({"@container": container}) => {
			if (container === "@set") {
				this.propertyChildsPromise = makeCancellable(this.getProperties(this.props.path).then(properties => {
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
			const existing = dictionarify(this.props.field.fields as FieldOptions[], (field: FieldOptions) => field.name);
			const [enums, enumNames] = this.state.childProps
				.filter(s => !existing[unprefixProp(s.property)])
				.reduce<[string[], string[]]>(([_enums, _enumNames], prop) => {
					_enums.push(prop.property);
					_enumNames.push(`${prop.property} (${prop.label})`);
					return [_enums, _enumNames];
				}, [[], []]);
			const schema = JSONSchema.enu({enum: enums, enumNames}, {title: this.context.translations.AddProperty});
			return (
				<LajiForm
					key={this.state.lajiFormToucher}
					schema={schema}
					onChange={this.onAddProperty}
					lang={this.context.lang}
					renderSubmit={false}
				/>
						);
		} else if (this.state.childProps === false) {
			return null;
		} else {
			return <Spinner />;
		}
	}

	onAddProperty = (property: string, b: any): void => {
		if (!property) {
			return;
		}
		const propertyModel = (this.state.childProps as PropertyModel[]).find(childProp => childProp.property === property);
		if ((propertyModel as PropertyModel).range.includes(PropertyRange.String)) {
			this.setState({lajiFormToucher: this.state.lajiFormToucher + 1});
			this.props.onChange([{type: "field", op: "add", value: propertyModel as PropertyModel}]);
		}
	}

	propertyModelToFieldOptions(property?: PropertyModel) {
		if (!property) {
			throw new Error("Tried to add nonexisting property")
		}
		return property;
	}

	getPropertiesContext = () => Promise.resolve(require("./documentContext")["@context"]);
	//getPropertiesContext = memoize(() => fetchJSON("http://schema.laji.fi/context/document.jsonld").then(result => result["@context"]))

	getMedataPropertyName(context: {[property: string]: PropertyContext}, property: string): PropertyContext {
		if (property === "gatherings") {
			return context.gathering;
		}
		return context[property];
	}

	getPropertyContextForPath(path: string): Promise<PropertyContext> {
		return new Promise((resolve, reject) =>
			this.getPropertiesContext().then((propertiesContext: any) => {
				const splits = path.split("/");
				if (splits.length === 1) {
					return resolve({
						"@id": "http://tun.fi/MY.document",
						"@container": "@set",
					});
				}
				const propertyContext = propertiesContext[splits[splits.length - 1]];
				resolve(propertyContext);
			}, reject)
		);
	}

	getPropertyNameFromContext(propertyContext: PropertyContext) {
		let id = propertyContext["@id"]
		id = id.replace("http://tun.fi/", "");
		switch (id) {
		case  "MY.gatherings":
			return "MY.gathering";
		case  "MY.gatheringEvent":
			return "MZ.gatheringEvent";
		case  "MY.gatheringFact":
			return "MY.gatheringFactClass";
		case  "MY.taxonCensus":
			return "MY.taxonCensusClass";
		case  "MY.units":
			return "MY.unit";
		case  "MY.unitFact":
			return "MY.unitFactClass";
		case  "MY.unitGathering":
			return "MZ.unitGathering";
		case  "MY.identifications":
			return "MY.identification";
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

	renderOptionsAndValidations = () => {
		const {options, validators, warnings} = this.props.field;
		const schema = JSONSchema.obj({
			options: JSONSchema.obj({}),
			validators: JSONSchema.obj({}),
			warnings: JSONSchema.obj({}),
		});
		const itemUiSchema = { "ui:field": "TextareaEditorField", "ui:options": { minRows: 5 } };
		const uiSchema = {
			options: itemUiSchema,
			validators: itemUiSchema,
			warnings: itemUiSchema
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
					newFormData = updateSafelyWithJSONPath(newFormData, translationKey, changedPath);
					events.push({type: "translations", key: translationKey, value: newValue});
				}
			} else {
				newFormData = updateSafelyWithJSONPath(newFormData, newValue, changedPath);
			}
		});
		if (newFormData !== formData) {
			events.push({type: "field", op: "update", value: {...this.props.field, ...newFormData}});
		}
		(events.length) && this.props.onChange(events);
	}
}
