import * as React from "react";
import { Context } from "src/client/components/Context";
import { HasChildren } from "src/client/components/components";
import { gnmspc } from "src/client/utils";

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

