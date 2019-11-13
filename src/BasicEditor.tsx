import * as React from "react";
import { FieldEditorProps, FieldEditorChangeEvent } from "./LajiFormEditor";
import { Stylable, Classable } from "./components";

export default class BasicEditor extends React.PureComponent<FieldEditorProps & Stylable & Classable> {
	render() {
		return "Apinanleipäpuun asukit";
	}
}
