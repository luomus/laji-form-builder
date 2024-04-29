import * as React from "react";
import { Classable, Stylable } from "src/client/components/components";
import { classNames, gnmspc } from "src/client/utils";

interface ClickableProps extends Classable, Stylable {
	children?: React.ReactNode;
	onClick?: (e: React.MouseEvent) => any;
	tag?: string;
}

interface ClickableElem extends Omit<ClickableProps, "tag"> {
	role: "button"
	tabIndex?: number;
}

export const Clickable = React.memo(function Clickable({children, onClick, className, tag} : ClickableProps) {
	const Elem = (props: ClickableElem) => React.createElement(tag || "span", props);
	return (
		<Elem
			onClick={onClick}
			tabIndex={onClick ? 0 : undefined}
			className={classNames(gnmspc("clickable"), className)}
			role="button"
		>
			{children || <span>&#8203;</span>}
		</Elem>
	);
});

