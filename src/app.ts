import LajiFormBuilder, { LajiFormBuilderProps } from "./LajiFormBuilder";
import * as React from "react";
import { render, unmountComponentAtNode } from "react-dom";

export default class LajiFormBuilderWrapper {
	rootElem: HTMLElement;
	constructor(props: LajiFormBuilderProps & {rootElem: HTMLElement}) {
		this.rootElem = props.rootElem;
		render(
			React.createElement(LajiFormBuilder, props, null),
			this.rootElem
		);
	}

	destroy = () => {
		unmountComponentAtNode(this.rootElem);
	}

	unmount = this.destroy;
}
