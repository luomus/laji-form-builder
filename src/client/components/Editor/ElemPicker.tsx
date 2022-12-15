import * as React from "react";
import { createPortal } from "react-dom";
import { Classable } from "../components";
import { Context } from "../Context";
import { findNearestParentSchemaElem } from "laji-form/lib/utils";
import { classNames, gnmspc } from "../../utils";

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

export interface ElemPickerProps extends Classable {
	onSelectedField: (selected: string) => void;
	onSelectedOptions: (selected: string[]) => void;
	containerRef: React.RefObject<HTMLDivElement>;
}
const ElemPicker = React.memo(function ElemPicker({
	onSelectedField,
	onSelectedOptions,
	className,
	containerRef
}: ElemPickerProps) {
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

	React.useEffect(() => {
		if (highlightedLajiFormElem) {
			setHighlightedElem(highlightedLajiFormElem);
		} else if (highlightedOptionElem) {
			setHighlightedElem(highlightedOptionElem);
		} else if (highlightedElem !== undefined) {
			setHighlightedElem(undefined);
		}
	}, [highlightedElem, highlightedLajiFormElem, highlightedOptionElem]);

	const onClick = React.useCallback((e) => {
		if (highlightedLajiFormElem) {
			const id = highlightedLajiFormElem?.id
				.replace(/_laji-form_[0-9]+_root|_[0-9]/g, "")
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
	return (
		<React.Fragment>
			<Button active={isActive}
			        onClick={isActive ? stop : start}
			        small
			        className={classNames(gnmspc("elem-picker"), className)}>
				<Glyphicon glyph="magnet" className={classNames(isActive && "active")} />
			</Button>
			<Highlighter highlightedElem={highlightedElem} active={isActive} onElemHighlighted={onElemHighlighted} />
		</React.Fragment>
	);
});

export default ElemPicker;

const Highlighter = ({highlightedElem, active, onElemHighlighted}
	: {highlightedElem?: Element, active?: boolean, onElemHighlighted: (e: Element) => void}) => {
	const ref = React.useRef<HTMLDivElement>(null);
	const highlighter = ref.current;
	const onMouseMove = React.useCallback(({clientX, clientY}: MouseEvent) => {
		const elems = document.elementsFromPoint(clientX, clientY);
		onElemHighlighted(highlighter && elems[0] === highlighter ? elems[1] : elems[0]);
	}, [highlighter, onElemHighlighted]);

	React.useEffect(() => {
		if (active) {
			document.addEventListener("mousemove", onMouseMove);
			return () => {
				document.removeEventListener("mousemove", onMouseMove);
			};
		} else {
			document.removeEventListener("mousemove", onMouseMove);
			return undefined;
		}
	}, [active, onMouseMove]);

	const {top, width, left, height} = highlightedElem?.getBoundingClientRect() || {};
	const scrolled = window.pageYOffset;
	React.useEffect(() => {
		if (!highlighter) {
			return;
		}
		if (!highlightedElem) {
			highlighter.style.display = "none";
			return;
		}
		highlighter.style.display = "block";
		if (typeof top === "number") {
			highlighter.style.top = top + scrolled + "px";
		}
		if (typeof left === "number") {
			highlighter.style.left = left + "px";
		}
		if (typeof width === "number") {
			highlighter.style.width = width + "px";
		}
		if (typeof height === "number") {
			highlighter.style.height = height + "px";
		}
	}, [highlighter, highlightedElem, top, width, left, height, scrolled]);
	return createPortal(
		<div ref={ref}
		     className={gnmspc("picker-highlighter")}
		     style={{position: "absolute", zIndex: 1039}} />,
		document.body
	);
};

