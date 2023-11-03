import * as React from "react";
import ButtonGroup from "react-bootstrap/lib/ButtonGroup";
import Button from "react-bootstrap/lib/Button";
import bs3 from "@luomus/laji-form/lib/themes/bs3";
import { Theme } from "./theme";

const _ButtonGroup = ButtonGroup as any;

const theme: Theme = {
	...bs3,
	ButtonGroup: ({small, ...props}) =>
		<_ButtonGroup bsSize={small ? "xsmall" : undefined} {...props} />,
	Button: ({small, variant, ...props}) =>
		<Button bsStyle={variant} bsSize={small ? "xsmall" : undefined} {...props} />
};
export default theme;
