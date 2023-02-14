import {
	Theme as LajiFormTheme,
	ButtonGroupProps as LajiFormButtonGroupProps,
	ListGroupProps as LajiFormListGroupProps,
	BreadcrumbItem as LajiFormBreadcrumbItem,
	ButtonProps as LajiFormButtonProps,
} from "laji-form/lib/themes/theme";
import {TooltipCompatible} from "../components/components";
export * from "laji-form/lib/themes/theme";

interface HasMaybeClassName {
	className?: string;
}

interface HasMaybeStyle {
	style?: React.CSSProperties;
}

export type ButtonGroupProps = LajiFormButtonGroupProps
	& HasMaybeClassName
	& HasMaybeStyle
	& TooltipCompatible 
	& {
	small?: true;
	vertical?: true;
	block?: true;
}

export type Breadcrumb = React.ComponentType<any> & {
	Item: React.ComponentType<LajiFormBreadcrumbItem & {active?: boolean}>;
}

export type ListGroupProps = LajiFormListGroupProps & HasMaybeClassName;

export type ButtonProps = LajiFormButtonProps & TooltipCompatible;

export interface Theme extends LajiFormTheme {
	Button: React.ComponentType<ButtonProps>;
	ButtonGroup: React.ComponentType<ButtonGroupProps>;
	ListGroup: React.ComponentType<ListGroupProps>;
	Breadcrumb: Breadcrumb;
}
