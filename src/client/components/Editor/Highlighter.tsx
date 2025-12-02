import * as React from "react";
import { createPortal } from "react-dom";
import { gnmspc } from "src/client/utils";

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

export default Highlighter;
