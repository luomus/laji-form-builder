import {
	Theme as LajiFormTheme,
	ButtonGroupProps as LajiFormButtonGroupProps,
	ListGroupProps as LajiFormListGroupProps,
	BreadcrumbItem as LajiFormBreadcrumbItem,
} from "laji-form/lib/themes/theme";
export * from "laji-form/lib/themes/theme";

interface HasMaybeClassName {
	className?: string;
}

interface HasMaybeStyle {
	style?: React.CSSProperties;
}

export interface ButtonGroupProps extends LajiFormButtonGroupProps, HasMaybeClassName, HasMaybeStyle {
	small?: true;
	vertical?: true;
	block?: true;
}

export type Breadcrumb = React.ComponentType<any> & {
	Item: React.ComponentType<LajiFormBreadcrumbItem & {active?: boolean}>;
}

export type ListGroupProps = LajiFormListGroupProps & HasMaybeClassName;

export interface Theme extends LajiFormTheme {
	ButtonGroup: React.ComponentType<ButtonGroupProps>;
	ListGroup: React.ComponentType<ListGroupProps>;
	Breadcrumb: Breadcrumb;
}
