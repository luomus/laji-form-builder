import { Theme as LajiFormTheme, ButtonGroupProps } from "laji-form/lib/themes/theme";

interface HasMaybeClassName {
	className?: string;
}

interface BuilderButtonGroupProps extends ButtonGroupProps, HasMaybeClassName {
	small?: true;
	vertical?: true;
}

export interface Theme extends LajiFormTheme {
	ButtonGroup: React.ComponentType<BuilderButtonGroupProps>;
}
