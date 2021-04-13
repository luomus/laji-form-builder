import { Theme as LajiFormTheme, ButtonGroupProps } from "laji-form/lib/themes/theme";

interface BuilderButtonGroupProps extends ButtonGroupProps {
	small?: true;
}

export interface Theme extends LajiFormTheme {
	ButtonGroup: React.ComponentType<BuilderButtonGroupProps>;
}
