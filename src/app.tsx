import LajiFormBuilder from "./LajiFormBuilder";
import * as React from "react"
import { render, unmountComponentAtNode } from "react-dom";

export default class LajiFormBuilderWrapper {
	props: any;
	rootElem: HTMLElement;
	app: any;
	constructor(props: any) {
		this.props = props;
		this.rootElem = props.rootElem;
		this.app = render(<LajiFormBuilder {...props}  />, this.rootElem);
	}

	destroy = () => {
		unmountComponentAtNode(this.rootElem);
	}

	unmount = this.destroy;
}
