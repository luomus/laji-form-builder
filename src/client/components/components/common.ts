export interface Stylable {
	style?: React.CSSProperties;
}

export interface Classable {
	className?: string;
}

export interface HasChildren {
	children: React.ReactNode;
}

export type TooltipCompatible<T = any> = {
	onMouseOut?: React.MouseEventHandler<T>;
	onMouseOver?: React.MouseEventHandler<T>;
}
