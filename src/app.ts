import Builder, { BuilderProps } from "./components/Builder";
import * as React from "react";
import { render, unmountComponentAtNode } from "react-dom";

export default class BuilderWrapper {
	rootElem: HTMLElement;
	constructor(props: BuilderProps & {rootElem: HTMLElement}) {
		this.rootElem = props.rootElem;
		render(
			React.createElement(Builder, props, null),
			this.rootElem
		);
	}

	destroy = () => {
		unmountComponentAtNode(this.rootElem);
	}

	unmount = this.destroy;
}
