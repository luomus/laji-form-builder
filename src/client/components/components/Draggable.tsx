import * as React from "react";
import { HasChildren, Classable, Stylable } from "./common";
import { classNames, nmspc } from "src/client/utils";

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


