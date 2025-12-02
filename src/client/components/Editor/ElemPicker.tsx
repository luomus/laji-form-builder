import * as React from "react";
import { Classable, TooltipCompatible } from "src/client/components/components";
import { Context } from "src/client/components/Context";
import { findNearestParentSchemaElem } from "@luomus/laji-form/lib/utils";
import { classNames, gnmspc } from "src/client/utils";
import Highlighter from "./Highlighter";

const parseOptionPaths = (elem: Element) => {
	const matches = elem.className.match(/laji-form-option-[^ ]+/g);
	return matches
		?  matches.map(s => s.replace("laji-form-option-", "").replace(/-/g, "/")) 
		: undefined;
};

const findOptionElem = (elem: Element) => {
	while (elem) {
		const match = (typeof elem.className === "string") && elem.className.match(/laji-form-option-/);
		if (match) {
			return elem;
		}
		elem = elem.parentNode as HTMLElement;
	}
	return undefined;
};

export type ElemPickerProps = Classable & TooltipCompatible & {
	onSelectedField: (selected: string) => void;
	onSelectedOptions: (selected: string[]) => void;
	containerRef: React.RefObject<HTMLDivElement>;
};
const ElemPicker = React.memo(React.forwardRef(function ElemPicker({
	onSelectedField,
	onSelectedOptions,
	className,
	containerRef,
	onMouseOver,
	onMouseOut
}: ElemPickerProps, ref) {
	const [isActive, setActive] = React.useState(false);
	const [highlightedLajiFormElem, setHighlightedLajiFormElem] = React.useState<Element>();
	const [highlightedOptionElem, setHighlightedOptionElem] = React.useState<Element>();
	const [highlightedElem, setHighlightedElem] = React.useState<Element>();

	const onElemHighlighted = React.useCallback((elem: Element) => {
		const lajiFormElem = findNearestParentSchemaElem(elem as HTMLElement);
		const optionElem = elem && findOptionElem(elem);
		if (lajiFormElem && !containerRef.current?.contains(lajiFormElem)) {
			setHighlightedLajiFormElem(lajiFormElem);
		} else if (optionElem) {
			setHighlightedOptionElem(optionElem);
		} else {
			setHighlightedLajiFormElem(undefined);
		}
	}, [containerRef]);

	const onClick = React.useCallback((e) => {
		if (highlightedLajiFormElem) {
			const id = highlightedLajiFormElem?.id
				.replace(/_laji-form_root|_[0-9]/g, "")
				.replace(/_/g, "/");
			if (!id) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			onSelectedField(`/document${id}`);
			setActive(false);
		} else if (highlightedOptionElem) {
			const optionPaths = parseOptionPaths(highlightedOptionElem);
			if (optionPaths) {
				onSelectedOptions(optionPaths);
				setActive(false);
			}
		}
	}, [setActive, highlightedLajiFormElem, highlightedOptionElem, onSelectedOptions, onSelectedField]);

	const onKeyDown = React.useCallback((e: KeyboardEvent) => {
		e.key === "Escape" && setActive(false);
	}, [setActive]);

	React.useEffect(() => {
		if (highlightedLajiFormElem) {
			setHighlightedElem(highlightedLajiFormElem);
		} else if (highlightedOptionElem) {
			setHighlightedElem(highlightedOptionElem);
		} else if (highlightedElem !== undefined) {
			setHighlightedElem(undefined);
		}
	}, [highlightedElem, highlightedLajiFormElem, highlightedOptionElem]);

	React.useEffect(() => {
		if (isActive) {
			document.addEventListener("click", onClick);
			document.addEventListener("keydown", onKeyDown);
			return () => {
				document.removeEventListener("click", onClick);
				document.removeEventListener("keydown", onKeyDown);
			};
		} else {
			document.removeEventListener("click", onClick);
			document.removeEventListener("keydown", onKeyDown);
			return undefined;
		}
	}, [isActive, onClick, onKeyDown]);

	React.useEffect(() => {
		if (!isActive) {
			setHighlightedLajiFormElem(undefined);
			setHighlightedOptionElem(undefined);
		}
	}, [isActive]);

	const start = React.useCallback(() => setActive(true), [setActive]);
	const stop = React.useCallback(() => setActive(false), [setActive]);
	const {Button, Glyphicon} = React.useContext(Context).theme;
	return <>
		<Button active={isActive}
		        onClick={isActive ? stop : start}
		        small
		        className={classNames(gnmspc("elem-picker"), className)}
		        onMouseOut={onMouseOut}
		        onMouseOver={onMouseOver}
		        ref={ref} >
			<Glyphicon glyph="magnet" className={classNames(isActive && "active")} />
		</Button>
		<Highlighter highlightedElem={highlightedElem} active={isActive} onElemHighlighted={onElemHighlighted} />
	</>;
}));

export default ElemPicker;
