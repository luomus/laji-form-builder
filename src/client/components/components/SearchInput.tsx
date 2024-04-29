import * as React from "react";
import { Context } from "src/client/components/Context";
import { gnmspc } from "src/client/utils";

type SearchInputProps = {
	onChange: (v: string) => void;
	onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>
	autoFocus?: boolean;
}

export const SearchInput = ({onChange, onKeyDown, autoFocus}: SearchInputProps) => {
	const {theme, translations} = React.useContext(Context);
	const {FormControl, Glyphicon} = theme;
	const [value, setValue] = React.useState("");
	const onSearchChange = React.useCallback((e) => {
		const {value} = e.target;
		setValue(value);
		onChange(value);
	}, [setValue, onChange]);
	return (
		<div className={gnmspc("search-input")} onKeyDown={onKeyDown}>
			<FormControl placeholder={translations["wizard.list.search.placeholder"]}
			             autoFocus={autoFocus}
			             onChange={onSearchChange}
			             value={value} />
			<Glyphicon glyph="search" />
		</div>
	);
};

