import * as React from "react";
import { Context } from "src/client/components/Context";
import { classNames } from "src/client/utils";

export const Button = React.memo(React.forwardRef(function Button({children, active, className, ...props}: any, ref) {
	const {Button} = React.useContext(Context).theme;
	return <Button className={classNames(className, active && "active")} {...props} ref={ref}>{children}</Button>;
}));

