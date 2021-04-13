import * as React from "react";
import * as ButtonGroup from "react-bootstrap/lib/ButtonGroup";
import bs3 from "laji-form/lib/themes/bs3";
import { Theme } from "./theme";

const _ButtonGroup = ButtonGroup as any;

const theme: Theme = {
	...bs3,
	ButtonGroup: ({small, ...props}) => <_ButtonGroup bsSize={small ? "xsmall" : undefined} {...props} />
};
export default theme;
