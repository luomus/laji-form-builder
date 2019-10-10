declare module "react-json-editor-ajrm" {
	import * as React from "react";

	interface JSONEditorProps {
		onChange: (value: any) => void;
		placeholder: any;
		locale: string;
	}
	export default class JSONEditor extends React.Component<any, any> {}
}
