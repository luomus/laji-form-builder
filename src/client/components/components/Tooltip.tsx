import * as React from "react";
import { Context } from "src/client/components/Context";
import { HasChildren } from "src/client/components/components";

export const Tooltip = ({children, tooltip, placement = "top", id}
	: {tooltip: string, placement?: string, id: string} & HasChildren) => {
	const {Tooltip, OverlayTrigger} = React.useContext(Context).theme;
	const _tooltip = <Tooltip id={id}>{tooltip}</Tooltip>;

	return <OverlayTrigger placement={placement} overlay={_tooltip}>{children}</OverlayTrigger>;
};
