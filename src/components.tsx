import * as React from "react";
import _Spinner from "react-spinner";
import { classNames, gnmspc } from "./utils";

export interface Stylable {
	style?: React.CSSProperties;
}
export interface Classable {
	className?: string;
}
export interface HasChildren {
	children?: React.ReactNode;
}

interface DraggableHeightProps {
	height?: number;
}
interface DraggableWidthProps {
	width?: number;
}
interface DraggableWidthHeightProps extends DraggableWidthProps, DraggableHeightProps {
	color?: string;
	dragHeight: boolean;
	dragWidth: boolean;
}
interface DraggableWidthHeightState {
	height?: number;
	width?: number;
}
class DraggableWidthHeight extends React.Component<DraggableWidthHeightProps & Stylable & HasChildren, DraggableWidthHeightState> {
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
	_onMouseDown: {height?: React.MouseEventHandler, width?: React.MouseEventHandler} = {};
	_onMouseUp: {height?: EventListener, width?: EventListener} = {};
	_onMouseMove: {height?: EventListener, width?: EventListener} = {};

	render() {
		let { style = {} } = this.props;
		if (this.props.dragHeight) {
			style = {...style, height: this.state.height };
		}
		const content = this.props.dragWidth ? (
				<div style={{display: "flex", flexDirection: "row", width: this.state.width, height: "100%", overflow: "hidden"}}>
			<div style={style}>
					{this.props.children}
					{this.getWidthDragLine()}
			</div>
				</div>
		) : this.props.children;

		return (
			<div style={style}>
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
			backgroundColor: this.props.color,
			marginTop: -1
		};
		return <div style={dragLineStyle} onMouseDown={this.onMouseDown("height")} />
	}

	getWidthDragLine() {
		if (!this.props.dragWidth) {
			return null;
		}
		const dragLineStyle: React.CSSProperties = {
			width: 1,
			cursor: "ew-resize",
			height: "100%",
			backgroundColor: this.props.color,
			paddingLeft: 1,
			position: "absolute",
			left: (this.state.width || 0) - 1
		};
		return <div style={dragLineStyle} onMouseDown={this.onMouseDown("width")} />
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

export const DraggableHeight = React.memo((props: DraggableHeightProps & Stylable & HasChildren) => <DraggableWidthHeight {...props} dragHeight={true} />);
export const DraggableWidth = React.memo((props: DraggableHeightProps & Stylable & HasChildren) => <DraggableWidthHeight {...props} dragWidth={true} />);

export const Clickable = React.memo(({children, onClick, className}: {children?: React.ReactNode, onClick?: (e: React.MouseEvent) => any} & Classable) =>
	<span onClick={onClick} tabIndex={onClick ? 0 : undefined} className={classNames(gnmspc("clickable"), className)}>{children || <span>&#8203;</span>}</span>
);



//const Button = React.memo(({children, active, className, ...props}: {children: React.ReactNode, active: boolean, props?: React.HTMLAttributes<HTMLButtonElement>}) =>
export const Button = React.memo(({children, active, className, ...props}: any) =>
	<button type="button" role="button" className={classNames("btn", className, active && "active")} {...props}>{children}</button>
);

//declare module "react-spinner" {
//		//	interface Spinner {
//		//		style: any;
//		//	}
//		// or
//	interface _Spinner extends AppProps { className?: string }
//	interface Spinner extends AppProps { }
//}
//
export const Spinner = React.memo(({color = "white"}: {color: "white" | "black"}) =>
	<_Spinner  />
	//<_Spinner className={color === "black" ? "bg-black" : ""} /> // TODO typescrit can't dig it...
)
