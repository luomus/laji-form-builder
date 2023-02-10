import * as React from "react";
import {
	ExpandedMaster, Field as FieldOptions, JSONObject, JSONSchema, Lang, Property, SchemaFormat
} from "../../../model";
import { getPropertyContextName, parseJSONPointer, unprefixProp } from "../../../utils";
import { classNames, fieldPointerToSchemaPointer, fieldPointerToUiSchemaPointer, gnmspc, nmspc } from "../../utils";
import { isValid } from "../Builder";
import { Classable, DraggableWidth, HasChildren } from "../components";
import { Context } from "../Context";
import { editorContentNmspc, EditorProps, EditorState, FieldEditorChangeEvent, TabChooser } from "./Editor";
import memoize from "memoizee";
import Fields from "./Fields";
import UiSchemaEditor from "./UiSchemaEditor";
import BasicEditor from "./BasicEditor";
import { ChangeEvent } from "../../services/change-handler-service";

export interface GenericFieldEditorProps extends Classable {
	uiSchema?: JSONObject;
	schema: JSONSchema;
	field: FieldOptions;
	translations: Record<string, string>;
	path: string;
	onChange: (changed: FieldEditorChangeEvent | FieldEditorChangeEvent[]) => void;
	context?: string
}

type Props = {
	expandedMaster: ExpandedMaster;
	schemaFormat: SchemaFormat;
} & Pick<EditorProps, "onChange">
	& Pick<EditorState, "selectedField">;

type State = {
	selected?: string;
	tab: ActiveEditorFieldMode;
}

type ActiveEditorFieldMode = "uiSchema" | "basic";
const tabs = {basic: "editor.tab.fields.basic", uiSchema: "editor.tab.fields.uiSchema"};

export default class FieldEditor extends React.PureComponent<Props, State> {

	static contextType = Context;

	state: State = {
		tab: "basic"
	}

	static getDerivedStateFromProps = (props: Props) => {
		if (props.selectedField) {
			return {selected: props.selectedField};
		}
		return null;
	}

	private fieldsRef = React.createRef<HTMLDivElement>();

	nmspc = nmspc("field-editor");

	render() {
		const {expandedMaster, schemaFormat} = this.props;
		const active = this.state.tab;

		const fieldEditorContentStyle: React.CSSProperties = {
			width: "100%",
			height: "100%"
		};

		const fieldsStyle: React.CSSProperties = {
			display: "flex",
			flexDirection: "column",
			height: "100%",
			overflowY: "auto"
		};

		const editorProps = {
			selected: this.state.selected,
			contentValid: isValid(schemaFormat),
			active,
			...this.getFieldEditorChildProps(expandedMaster, schemaFormat)
		};

		return <>
			<ActiveEditorErrorBoundary>
				<DraggableWidth style={fieldsStyle}
				                className={gnmspc("editor-nav-bar")}
				                ref={this.fieldsRef} >
					<Fields className={gnmspc("field-chooser")}
					        fields={this.getFields(expandedMaster)}
					        onSelected={this.onFieldSelected}
					        onDeleted={this.onFieldDeleted}
					        onAdded={this.onFieldAdded}
					        selected={this.state.selected}
					        pointer=""
					        expanded={true}
					        fieldsContainerElem={this.fieldsRef.current} />
				</DraggableWidth>
				{this.state.selected && <div style={{display: "flex", flexDirection: "column", width: "100%"}}>
					<TabChooser tabs={tabs}
					            active={this.state.tab}
					            onChange={this.onTabChange}
					            className={this.nmspc("toolbar")} />
					<div style={fieldEditorContentStyle} className={this.nmspc("content")}>{
						active === "uiSchema" && <UiSchemaEditor {...editorProps} />
						|| active === "basic" && <BasicEditor {...editorProps} />
						|| null
					}</div>
				</div>}
			</ActiveEditorErrorBoundary>
		</>;
	}

	onTabChange = (tab: ActiveEditorFieldMode) => {
		this.setState({tab});
	}

	getSelected = () => this.getFieldPath(this.state.selected || "");

	getFieldEditorChildProps(expandedMaster: ExpandedMaster, schemaFormat: SchemaFormat) : GenericFieldEditorProps {
		const { editorLang } = this.context;
		const selected = this.getSelected();
		const findField = (_field: FieldOptions, path: string): FieldOptions => {
			const [next, ...rest] = path.split("/").filter(s => s);
			if (next === undefined) {
				return _field;
			}
			const child  = (_field.fields as FieldOptions[])
				.find(_child => _child.name === next) as FieldOptions;
			return findField(child, rest.join("/"));
		};
		return {
			schema: parseJSONPointer(schemaFormat.schema, fieldPointerToSchemaPointer(schemaFormat.schema, selected)),
			uiSchema: parseJSONPointer(
				expandedMaster.uiSchema,
				fieldPointerToUiSchemaPointer(schemaFormat.schema, selected),
				!!"safely"
			),
			field: findField(this.getFields(expandedMaster)[0], selected),
			translations: expandedMaster.translations?.[editorLang as Lang] || {},
			path: selected,
			onChange: this.onEditorChange,
			context: expandedMaster.context,
		};
	}

	getFields = memoize((master: ExpandedMaster): any => ([{
		name: unprefixProp(getPropertyContextName(master.context)),
		fields: master.fields
	}]));

	getFieldPath = (path: string) => {
		const globalSlashRegexp = /\//g;
		const firstSlashSeparatedPathPart = /\/[^/]*/;
		const slashMatch = path.match(globalSlashRegexp);
		const isRootField = slashMatch && slashMatch.length === 1;
		return isRootField ? "/" : path.replace(firstSlashSeparatedPathPart, "");
	}

	onFieldDeleted = (field: string) => {
		this.props.onChange([{type: "field", op: "delete", selected: this.getFieldPath(field)}]);
	}

	onFieldAdded = (field: string, property: Property) => {
		this.props.onChange([{type: "field", op: "add" as const, selected: this.getFieldPath(field), value: property}]);
	}

	onFieldSelected = (field: string) => {
		this.setState({selected: field});
	}

	onEditorChange = (events: FieldEditorChangeEvent | FieldEditorChangeEvent[]) => {
		events = (events instanceof Array ? events : [events]).map(event => {
			return { ...event, selected: this.getSelected() };
		});

		this.props.onChange(events as ChangeEvent[]);
	}
}

class ActiveEditorErrorBoundary extends React.Component<HasChildren, {hasError: boolean}> {
	static contextType = Context;
	context!: React.ContextType<typeof Context>;
	state = {hasError: false}
	static getDerivedStateFromError() {
		return {hasError: true};
	}
	render() {
		return this.state.hasError
			? <div className={gnmspc("error")}>{this.context.translations["editor.error.ui"]}</div>
			: this.props.children;
	}
}
