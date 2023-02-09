import * as React from "react";
import { Property, Field as FieldOptions } from "../../../model";
import { dictionarify, getRootField, getRootProperty, JSONSchemaBuilder, unprefixProp } from "../../../utils";
import { classNames, nmspc, scrollIntoViewIfNeeded } from "../../utils";
import { Stylable, Classable, Clickable, Spinner, GenericModal } from "../components";
import { Context } from "../Context";
import LajiForm from "../LajiForm";

type OnSelectedCB = (field: string) => void;

const Fields = React.memo(function _Fields({
	fields = [],
	onSelected,
	onDeleted,
	onAdded,
	selected,
	pointer,
	style = {},
	className,
	expanded,
	fieldsContainerElem
} : {
	fields: FieldProps[];
	onSelected: OnSelectedCB;
	onDeleted: OnSelectedCB;
	onAdded: (field: string, property: Property) => void;
	selected?: string;
	pointer: string;
	expanded?: boolean;
	fieldsContainerElem: HTMLDivElement | null;
} & Stylable & Classable) {
	return (
		<div style={{...style, display: "flex", flexDirection: "column"}} className={className}>
			{fields.map((f: FieldProps) => (
				<Field key={f.name}
				       {...f}
				       onSelected={onSelected}
				       onDeleted={onDeleted}
				       onAdded={onAdded}
				       selected={selected}
				       pointer={`${pointer}/${f.name}`}
				       expanded={expanded}
				       fieldsContainerElem={fieldsContainerElem}
				/>
			))}
		</div>
	);
});

export default Fields;

interface FieldProps extends FieldOptions {
	pointer: string;
	selected?: string;
	onSelected: OnSelectedCB;
	onDeleted: OnSelectedCB;
	onAdded: (field: string, property: Property) => void;
	fields?: FieldProps[];
	expanded?: boolean;
	fieldsContainerElem: HTMLDivElement | null;
	context: string;
}
interface FieldState {
	expanded: boolean;
	prevSelected?: string;
	prevExpanded?: boolean;
	addOpen: boolean
	properties?: Property[] | false;
}
class Field extends React.PureComponent<FieldProps, FieldState> {
	state: FieldState = {
		expanded: this.props.expanded || Field.isSelected(this.props.selected, this.props.pointer) ||  false,
		addOpen: false
	};
	private fieldRef = React.createRef<HTMLDivElement>();
	private nmspc = nmspc("field");
	private propertyContextAbortController: AbortController;

	context!: React.ContextType<typeof Context>;
	static contextType = Context;

	static getDerivedStateFromProps(nextProps: FieldProps, prevState: FieldState) {
		if (nextProps.selected !== prevState.prevSelected
			&& !Field.isChildSelected(prevState.prevSelected, nextProps.pointer)
			&& Field.isChildSelected(nextProps.selected, nextProps.pointer)
		) {
			return {expanded: true};
		}
		return {};
	}

	componentDidUpdate(prevProps: FieldProps) {
		this.scrollToIfNeeded(prevProps);
	}

	componentDidMount() {
		this.scrollToIfNeeded();

		this.propertyContextAbortController = new AbortController();
		this.getProperties(this.props.pointer, this.propertyContextAbortController.signal).then(properties =>  
			this.setState({properties: properties.length ? properties : false})
		);
	}

	scrollToIfNeeded(prevProps?: FieldProps) {
		if ((!prevProps || !Field.isSelected(prevProps.selected, prevProps.pointer))
			&& Field.isSelected(this.props.selected, this.props.pointer)
			&& this.fieldRef.current && this.props.fieldsContainerElem
		) {
			scrollIntoViewIfNeeded(this.fieldRef.current, 0, 0, this.props.fieldsContainerElem);
		}
	}

	static isSelected(selected: string | undefined, pointer: string): boolean {
		return selected === pointer;
	}

	static isChildSelected(selected = "", pointer: string): boolean {
		return selected.startsWith(pointer);
	}

	toggleExpand = (e: React.MouseEvent<HTMLElement>) => {
		e.stopPropagation();
		this.setState({expanded: !this.state.expanded});
	}

	onThisSelected = () => {
		this.props.onSelected(this.props.pointer);
	}

	onChildSelected = (pointer: string) => {
		this.props.onSelected(pointer);
	}

	onThisDeleted = () => {
		this.props.onDeleted(this.props.pointer);
	}

	onChildDeleted = (pointer: string) => {
		this.props.onDeleted(pointer);
	}

	onOpenAdd = () => {
		this.setState({addOpen: true});
	}

	onCloseAdd = () => {
		this.setState({addOpen: false});
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
			`${path.length === 1 ? "" : path}`,
			getRootProperty(getRootField({context: this.props.context}))
		);

		if (property.isEmbeddable) {
			return await this.context.metadataService.getPropertiesForEmbeddedProperty(property.range[0]);
		} else {
			return [];
		}
	}

	render() {
		const {name, fields = [], selected, pointer} = this.props;
		const expandClassName = this.nmspc(fields.length
			? this.state.expanded
				? "expanded"
				: "contracted"
			: "nonexpandable");
		const isSelected = Field.isSelected(this.props.selected, this.props.pointer);
		const containerClassName = classNames(
			this.nmspc("item"),
			this.nmspc(pointer.substr(1).replace(/\//g, "-")),
			isSelected && this.nmspc("item-selected")
		);
		return (
			<div className={classNames(this.nmspc(), isSelected && this.nmspc("selected"))} ref={this.fieldRef}>
				<Clickable
					className={containerClassName}
					onClick={this.onThisSelected}
				>
					<Clickable className={expandClassName}
					           onClick={fields.length ? this.toggleExpand : undefined}
					           key="expand" />
					<Clickable className={this.nmspc("label")}>{name}</Clickable>
					{this.state.properties === false
						? null
						: this.state.properties?.length
							? <Clickable className={this.nmspc("add")} onClick={this.onOpenAdd} />
							: <Spinner color="white" size={15} />
					}
					<Clickable className={this.nmspc("delete")} onClick={this.onThisDeleted} />
				</Clickable>
				{this.state.expanded && (
					<Fields
						fields={fields}
						onSelected={this.onChildSelected}
						onDeleted={this.onChildDeleted}
						onAdded={this.props.onAdded}
						selected={selected}
						pointer={pointer}
						fieldsContainerElem={this.props.fieldsContainerElem}
					/>
				)}
				{this.state.addOpen && (
					<GenericModal onHide={this.onCloseAdd}>
						{this.renderAdder()}
					</GenericModal>
				)}
			</div>
		);
	}

	renderAdder = () => {
		if (!this.state.properties) {
			return null;
		}

		const existing = dictionarify(this.props.fields || [], (field: FieldOptions) => field.name);
		const [enums, enumNames] = this.state.properties
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
			{title: this.context.translations["addProperty"]}
		);
		return (
			<LajiForm
				schema={schema}
				onChange={this.onAddProperty}
				autoFocus={true}
			/>
		);
	}

	onAddProperty = (property: string): void => {
		if (!property) {
			return;
		}
		const propertyModel = (this.state.properties as Property[])
			.find(childProp => childProp.property === property);
		if (propertyModel) {
			this.props.onAdded(this.props.pointer, propertyModel);
			this.onCloseAdd();
		}
	}
}

