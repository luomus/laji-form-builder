import * as React from "react";
import _Spinner from "react-spinner";
import { Context } from "./Context";
import { classNames, nmspc, gnmspc, CSS_NAMESPACE } from "../utils";
import { JSON } from "../../model";
import LajiFormContext from "@luomus/laji-form/lib/ReactContext";
import { Help as LJHelp } from "@luomus/laji-form/lib/components/components";

export interface Stylable {
	style?: React.CSSProperties;
}
export interface Classable {
	className?: string;
}
export interface HasChildren {
	children: React.ReactNode;
}

export type TooltipCompatible<T = any> = {
	onMouseOut?: React.MouseEventHandler<T>;
	onMouseOver?: React.MouseEventHandler<T>;
}

type Position = "bottom";
interface DraggablePublicProps extends Stylable, Classable, HasChildren {
	thickness?: number;
	dragClassName?: string;
	containerClassName?: string;
	onChange?: (change: any) => void;
}
interface DraggableHeightProps extends DraggablePublicProps {
	height?: number;
	fixed?: Position;
}
interface DraggableWidthProps extends DraggablePublicProps  {
	width?: number;
}
interface DraggableWidthHeightProps extends DraggableWidthProps, DraggableHeightProps {
	dragHeight: boolean;
	dragWidth: boolean;
	containerRef?: React.Ref<HTMLDivElement>;
}
interface DraggableWidthHeightState {
	height?: number;
	width?: number;
}
class DraggableWidthHeight extends React.Component<DraggableWidthHeightProps, DraggableWidthHeightState> {
	state = {
		height: this.props.dragHeight ? this.props.height || 200 : undefined,
		width: this.props.dragWidth ? this.props.width || 200 : undefined
	};
	static defaultProps = {
		dragHeight: false,
		dragWidth: false,
		thickness: 4
	};
	dragging = false;
	startY: number;
	startX: number;
	heightAtStart?: number;
	widthAtStart?: number;
	fixed: Position;
	_onMouseDown: {height?: React.MouseEventHandler, width?: React.MouseEventHandler} = {};
	_onMouseUp: {height?: EventListener, width?: EventListener} = {};
	_onMouseMove: {height?: EventListener, width?: EventListener} = {};

	nmspc = nmspc("draggable");

	render() {
		const { style, fixed, containerClassName } = this.props;
		const children = (
			<div style={style} className={this.props.className} ref={this.props.containerRef}>
				{this.props.children}
			</div>
		);
		const content = this.props.dragWidth ? (
			<div style={{
				display: "flex",
				flexDirection: "row",
				width: this.state.width,
				height: "100%",
				overflow: "hidden"
			}}>
				<div style={{width: "100%"}}>
					{children}
					{this.getWidthDragLine()}
				</div>
			</div>
		) : children;

		const heightContainerStyle = fixed === "bottom"
			?  {
				display: "flex",
				flexDirection: "row",
				position: "fixed",
				bottom: 0,
				left: 0,
				zIndex: 1040,
			} as React.CSSProperties
			: {};
		const containerStyle = this.props.dragHeight
			? {...heightContainerStyle, height: this.state.height || 0, width: "100%"}
			: {};
		return (
			<div style={containerStyle}
			     className={containerClassName}>
				{this.getHeightDragLine()}
				{content}
			</div>
		);
	}

	getHeightDragLine() {
		if (!this.props.dragHeight) {
			return null;
		}
		const dragLineStyle: React.CSSProperties = {
			position: "absolute",
			width: "100%",
			cursor: "row-resize",
			height: this.props.thickness,
			marginTop: -Math.floor((this.props.thickness as number) / 2),
			opacity: 0
		};
		return (
			<div
				style={dragLineStyle}
				className={classNames(this.nmspc("line"), this.nmspc("height"), this.props.dragClassName)}
				onMouseDown={this.onMouseDown("height")}
			/>
		);
	}

	getWidthDragLine() {
		if (!this.props.dragWidth) {
			return null;
		}
		const dragLineStyle: React.CSSProperties = {
			width: this.props.thickness,
			cursor: "ew-resize",
			height: "100%",
			paddingLeft: 1,
			position: "absolute",
			left: (this.state.width || 0) - ((this.props.thickness as number) / 2), 
			top: 0,
			opacity: 0
		};
		return (
			<div
				style={dragLineStyle}
				className={classNames(this.nmspc("line"), this.nmspc("width"), this.props.dragClassName)}
				onMouseDown={this.onMouseDown("width")}
			/>
		);
	}

	onMouseDown = (dir: "height" | "width") => {
		if (!this._onMouseDown[dir]) {
			this._onMouseDown[dir] = (e: React.MouseEvent) => {
				e.preventDefault();
				if (this.dragging) {
					return;
				}
				this.dragging = true;
				this.startY = e.clientY;
				this.startX = e.clientX;
				this.heightAtStart = this.state.height;
				this.widthAtStart = this.state.width;
				document.addEventListener("mouseup", this.onMouseUp(dir));
				document.addEventListener("mousemove", this.onMouseMove(dir));
			};
		}
		return this._onMouseDown[dir];
	}
	onMouseUp = (dir: "height" | "width"): EventListener => {
		if (!this._onMouseUp[dir]) {
			this._onMouseUp[dir] = () => {
				if (!this.dragging) {
					return;
				}
				this.dragging = false;
				document.removeEventListener("mouseup", this.onMouseUp(dir));
				document.removeEventListener("mousemove", this.onMouseMove(dir));
				this.props.onChange?.({[dir]: this.state[dir]});
			};
		}
		return this._onMouseUp[dir] as EventListener;
	}
	onMouseMove = (dir: "height" | "width"): EventListener => {
		if (!this._onMouseMove[dir]) {
			this._onMouseMove[dir] = (e: MouseEvent) => {
				const _state: DraggableWidthHeightState = {};
				if (dir === "height" && this.props.dragHeight) {
					_state.height = (this.heightAtStart || 0) + (this.startY - e.clientY);
				}
				if (dir === "width" && this.props.dragWidth) {
					_state.width = (this.widthAtStart || 0) - (this.startX - e.clientX);
				}
				this.setState(_state);
			};
		}
		return this._onMouseMove[dir] as EventListener;
	}
}

export const DraggableHeight = React.memo(function DraggableHeight(
	props: DraggableHeightProps & Stylable & Classable & HasChildren) {
	return <DraggableWidthHeight {...props} dragHeight={true} />;
});

export const DraggableWidth = React.forwardRef((
	props: DraggableWidthProps & Stylable & Classable & HasChildren, ref: React.Ref<HTMLDivElement>) => {
	return <DraggableWidthHeight {...props} dragWidth={true} containerRef={ref} />;
});


interface ClickableProps extends Classable, Stylable {
	children?: React.ReactNode;
	onClick?: (e: React.MouseEvent) => any;
	tag?: string;
}

interface ClickableElem extends Omit<ClickableProps, "tag"> {
	role: "button"
	tabIndex?: number;
}

export const Clickable = React.memo(function Clickable({children, onClick, className, tag} : ClickableProps) {
	const Elem = (props: ClickableElem) => React.createElement(tag || "span", props);
	return (
		<Elem
			onClick={onClick}
			tabIndex={onClick ? 0 : undefined}
			className={classNames(gnmspc("clickable"), className)}
			role="button"
		>
			{children || <span>&#8203;</span>}
		</Elem>
	);
});

export const Button = React.memo(React.forwardRef(function Button({children, active, className, ...props}: any, ref) {
	const {Button} = React.useContext(Context).theme;
	return <Button className={classNames(className, active && "active")} {...props} ref={ref}>{children}</Button>;
}));

export const Spinner = React.memo(function Spinner(
	{color = "black", size = 32, className, style = {}}
	: {color?: "white" | "black", size?: number} & Classable & Stylable) {
	return (
		<_Spinner
			style={size ? {width: size, height: size, ...style} : style}
			className={classNames(
				gnmspc("spinner-container"),
				gnmspc(color === "black" ? "spinner-black" : ""),
				className)}
		/>
	);
});

const getMinMaxed = (val: number, min?: number, max?: number) => {
	if (min) {
		val = Math.max(val, min);
	}
	if (max) {
		val = Math.min(val, max);
	}
	return val;
};

export type JSONEditorProps<T extends JSON | undefined> = {
	value?: T;
	onChange?: ((value?: T) => void) | React.Dispatch<React.SetStateAction<T | undefined>>;
	validator: (value?: JSON) => value is T;
	rows?: number;
	minRows?: number;
	maxRows?: number;
	resizable?: boolean;
	onValidChange?: (valid: boolean) => void;
	live?: boolean;
} & Classable & Stylable;

export const JSONEditor = React.forwardRef(function JSONEditor<T extends JSON | undefined>(
	{value, onChange, rows, minRows, maxRows, resizable = true, onValidChange, live, className, style = {}, validator}
	: JSONEditorProps<T>,
	ref: React.Ref<HTMLTextAreaElement>) {
	const stringValue = JSON.stringify(value, undefined, 2) ?? "";
	const [tmpValue, setTmpValue] = React.useState(stringValue);
	const [validValue, setValidValue] = React.useState(value);
	const [valid, setValid] = React.useState(true);
	const [touched, setTouched] = React.useState(false);

	React.useEffect(() => {
		if (tmpValue === "" || tmpValue === undefined) {
			const valid = validator(undefined);
			setValid(valid);
			valid && setValidValue(undefined);
			return;
		}
		try {
			const parsed = JSON.parse(tmpValue);
			const valid = validator(JSON.parse(tmpValue));
			valid && setValidValue(parsed);
			setValid(valid);
		} catch (e) {
			setValid(false);
		}
	}, [tmpValue, validator, setValid]);

	const tryOnChange = React.useCallback(() => {
		if (!valid) {
			return;
		}
		onChange?.(validValue);
	}, [valid, validValue, onChange]);

	React.useEffect(() => setTmpValue(stringValue), [stringValue]);
	React.useEffect(() => {
		touched && live && tryOnChange();
	}, [touched, live, validValue, tryOnChange]);

	React.useEffect(() => onValidChange?.(valid), [valid, onValidChange]);

	const onTextareChange = React.useCallback((e: any) => {
		setTouched(true);
		setTmpValue(e.target.value);
	}, []);

	const onBlur = React.useCallback(() => {
		if (!touched) {
			return;
		}
		tryOnChange();
	}, [touched, tryOnChange]);

	const _rows = getMinMaxed(
		rows === undefined
			? (tmpValue ?? "").split("\n").length
			: rows,
		minRows,
		maxRows
	);

	const editorNmspc = nmspc("json-editor");

	return (
		<textarea
			className={classNames("form-control", editorNmspc(), !valid && editorNmspc("invalid"), className)}
			onBlur={onBlur}
			rows={_rows}
			style={{...style, width: "100%", resize: resizable ? "vertical" : "none"}}
			onChange={onTextareChange}
			value={tmpValue}
			ref={ref}
		/>
	);
});

export type SubmittableJSONEditorProps<T extends JSON | undefined> =
	Pick<JSONEditorProps<T>, "value" | "validator" | "onChange">
	& {
	onSubmit: (value: T) => void;
	onSubmitDraft?: (value: T) => void;
	submitLabel?: string;
} & Classable;

export function SubmittableJSONEditor<T extends JSON>(
	{value, onSubmit, validator, onSubmitDraft, onChange, className, submitLabel}: SubmittableJSONEditorProps<T>
) {
	const {translations} = React.useContext(Context);
	const [json, _setJSON] = React.useState(value);
	const setJSON = React.useCallback((json) => {
		onChange?.(json);
		_setJSON(json);
	}, [onChange, _setJSON]);

	const [valid, setValid] = React.useState(false);
	const onClickSubmit = React.useCallback(() => onSubmit(json as unknown as T), [json, onSubmit]);
	const onClickSubmitDraft = React.useCallback(() => onSubmitDraft?.(json as unknown as T), [json, onSubmitDraft]);

	// Focus on mount.
	const ref = React.useRef<HTMLTextAreaElement>(null);
	React.useEffect(() => ref.current?.focus(), []);

	return (
		<div className={className}>
			<JSONEditor value={json} 
			            validator={validator}
			            onChange={setJSON}
			            onValidChange={setValid}
			            live={true}
			            ref={ref}
			            style={{height: "80vh"}} />
			<Button onClick={onClickSubmit}
			        variant="primary"
			        disabled={json === undefined || !valid}
			>{submitLabel || "OK"}
			</Button>
			{onSubmitDraft && (
				<Button onClick={onClickSubmitDraft}
			          disabled={json === undefined || !valid}
			          variant={"default"}
			          className={`${className ? className + "-" : CSS_NAMESPACE}preview-btn`}
				>{translations["wizard.option.json.import.draft"]}
				</Button>
			)}
		</div>
	);
}

const bypassValidator = (v: JSON): v is JSON => true;

export const AnyJSONEditor = (props: Omit<JSONEditorProps<JSON>, "validator">) =>
	<JSONEditor {...props} validator={bypassValidator} />;

type SearchInputProps = {
	onChange: (v: string) => void;
	onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>
	autoFocus?: boolean;
}

export const SearchInput = ({onChange, onKeyDown, autoFocus}: SearchInputProps) => {
	const {theme, translations} = React.useContext(Context);
	const {FormControl, Glyphicon} = theme;
	const [value, setValue] = React.useState("");
	const onSearchChange = React.useCallback((e) => {
		const {value} = e.target;
		setValue(value);
		onChange(value);
	}, [setValue, onChange]);
	return (
		<div className={gnmspc("search-input")} onKeyDown={onKeyDown}>
			<FormControl placeholder={translations["wizard.list.search.placeholder"]}
			             autoFocus={autoFocus}
			             onChange={onSearchChange}
			             value={value} />
			<Glyphicon glyph="search" />
		</div>
	);
};

export type GenericModalProps = {
	onHide: () => void;
	header?: string;
	bodyRef?: React.Ref<HTMLDivElement>
} & HasChildren & Classable

export const GenericModal = ({onHide, children, header, className, bodyRef}: GenericModalProps) => {
	const {theme} = React.useContext(Context);
	const {Modal} = theme;
	return (
		<Modal show={true} onHide={onHide} dialogClassName={classNames(gnmspc(), gnmspc("wide-modal"), className)}>
			<Modal.Header closeButton={true}>
				<h4>{header}</h4>
			</Modal.Header>
			<Modal.Body>
				<div ref={bodyRef}>
					{ children }
				</div>
			</Modal.Body>
		</Modal>
	);
};

export class ErrorBoundary extends React.Component<HasChildren, {hasError: boolean}> {
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

export const Tooltip = ({children, tooltip, placement = "top", id}
	: {tooltip: string, placement?: string, id: string} & HasChildren) => {
	const {Tooltip, OverlayTrigger} = React.useContext(Context).theme;
	const _tooltip = <Tooltip id={id}>{tooltip}</Tooltip>;

	return <OverlayTrigger placement={placement} overlay={_tooltip}>{children}</OverlayTrigger>;
};

export const Help = (props: any) => {
	const context = React.useContext(Context);
	return (
		<div className="laji-form" style={{display: "initial"}}>
			<LajiFormContext.Provider value={context}>
				<LJHelp  {...props} />
			</LajiFormContext.Provider>
		</div>
	);
};
