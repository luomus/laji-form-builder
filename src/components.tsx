import * as React from "react";
import _Spinner from "react-spinner";
import { classNames, nmspc, gnmspc } from "./utils";

export interface Stylable {
	style?: React.CSSProperties;
}
export interface Classable {
	className?: string;
}
export interface HasChildren {
	children?: React.ReactNode;
}

type Position = "bottom";
interface DraggableHeightProps {
	height?: number;
	fixed?: Position;
}
interface DraggableWidthProps {
	width?: number;
}
interface DraggableWidthHeightProps extends DraggableWidthProps, DraggableHeightProps {
	color?: string;
	dragHeight: boolean;
	dragWidth: boolean;
	dragClassName?: string;
}
interface DraggableWidthHeightState {
	height?: number;
	width?: number;
}
class DraggableWidthHeight extends React.Component<DraggableWidthHeightProps & Stylable & Classable & HasChildren, DraggableWidthHeightState> {
	state = {
		height: this.props.dragHeight ? this.props.height || 200 : undefined,
		width: this.props.dragWidth ? this.props.width || 200 : undefined
	};
	static defaultProps = {
		color: "black",
		dragHeight: false,
		dragWidth: false,
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
		const { style, fixed } = this.props;
		const children = (
			<div style={style} className={this.props.className}>
				{this.props.children}
			</div>
		);
		const content = this.props.dragWidth ? (
				<div style={{display: "flex", flexDirection: "row", width: this.state.width, height: "100%", overflow: "hidden"}}>
			<div>
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
			zIndex: 10000,
		} as React.CSSProperties : {};
		return (
			<div style={this.props.dragHeight && {...heightContainerStyle, height: this.state.height || 0, width: "100%"} || {}}>
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
			height: 1,
			marginTop: -1
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
			width: 1,
			cursor: "ew-resize",
			height: "100%",
			paddingLeft: 1,
			position: "absolute",
			left: (this.state.width || 0) - 1,
			top: 0
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
			}
		}
		return this._onMouseDown[dir];
	}
	onMouseUp = (dir: "height" | "width"): EventListener => {
		if (!this._onMouseUp[dir]) {
			this._onMouseUp[dir] = (e: MouseEvent) => {
				if (!this.dragging) {
					return;
				}
				this.dragging = false;
				document.removeEventListener("mouseup", this.onMouseUp(dir));
				document.removeEventListener("mousemove", this.onMouseMove(dir));
			}
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

export const DraggableHeight = React.memo((props: DraggableHeightProps & Stylable & Classable & HasChildren) => <DraggableWidthHeight {...props} dragHeight={true} />);
export const DraggableWidth = React.memo((props: DraggableWidthProps & Stylable & Classable & HasChildren) => <DraggableWidthHeight {...props} dragWidth={true} />);

export const Clickable = React.memo(({children, onClick, className}: {children?: React.ReactNode, onClick?: (e: React.MouseEvent) => any} & Classable) =>
	<span onClick={onClick} tabIndex={onClick ? 0 : undefined} className={classNames(gnmspc("clickable"), className)}>{children || <span>&#8203;</span>}</span>
);



//const Button = React.memo(({children, active, className, ...props}: {children: React.ReactNode, active: boolean, props?: React.HTMLAttributes<HTMLButtonElement>}) =>
export const Button = React.memo(({children, active, className, ...props}: any) =>
	<button type="button" role="button" className={classNames("btn", className, active && "active")} {...props}>{children}</button>
);

export const Spinner = React.memo(({color = "white", size = 32}: {color: "white" | "black", size?: number}) => (
	<_Spinner
		style={size ? {width: size, height: size} : {}}
		className={classNames(gnmspc("spinner-container"), gnmspc(color === "black" ? "spinner-black" : ""))}
	/>
))
