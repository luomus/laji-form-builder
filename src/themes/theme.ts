import { Theme as LajiFormTheme, ButtonGroupProps } from "laji-form/lib/themes/theme";

interface HasMaybeClassName {
	className?: string;
}

interface HasMaybeStyle {
	style?: React.CSSProperties;
}

interface BuilderButtonGroupProps extends ButtonGroupProps, HasMaybeClassName, HasMaybeStyle {
	small?: true;
	vertical?: true;
}

export interface Theme extends LajiFormTheme {
	ButtonGroup: React.ComponentType<BuilderButtonGroupProps>;
}
