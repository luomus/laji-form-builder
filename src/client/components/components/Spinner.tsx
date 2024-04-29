import * as React from "react";
import { Classable, Stylable } from "src/client/components/components";
import { classNames, gnmspc } from "src/client/utils";
import _Spinner from "react-spinner";

export const Spinner = React.memo(function Spinner(
	{color = "black", size = 32, className, style = {}}
	: {color?: "white" | "black", size?: number} & Classable & Stylable) {
	return (
		<_Spinner
			style={size ? {width: size, height: size, ...style} : style}
			className={classNames(
				gnmspc("spinner-container"),
				gnmspc(color === "black" ? "spinner-black" : ""),
				className)}
		/>
	);
});
