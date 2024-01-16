import * as React from "react";
import { FormListing, Master } from "../../../model";
import { MaybeError, isValid  } from "../Builder";
import { Button, Classable, GenericModal, Tooltip } from "../components";
import { Context } from "../Context";
import { classNames, isSignalAbortError, nmspc, runAbortable, useBooleanSetter } from "../../utils";
import { Tree, Data as D3HierarchyData } from "react-tree-graph";
import { dictionarifyByKey } from "../../../utils";

type Hierarchy = D3HierarchyData & {
	label: JSX.Element;
	parent?: Hierarchy;
	// children: Hierarchy[];
};

const LABEL_HEIGHT = 18; // Should match the actual height in DOM.
const LABEL_PADDING = 5;
const NODES_PADDING = 20;

const hierarchyNmpsc = nmspc("hierarchy");

const getLabel = (form: FormListing, idToUri?: (uri: string) => string) => {
	const y = LABEL_HEIGHT + LABEL_PADDING;
	const { name = "" } = form;
	let ellipsedName = name.substring(0, 21);
	if (ellipsedName.length < name.length) {
		ellipsedName += "...";
	}
	const text = (
		<g id={form.id} className={hierarchyNmpsc("label")}>
			<text>{form.id}</text>
			<text y={y}>{ellipsedName}</text>
			<title>{name}</title>
		</g>
	);
	return idToUri
		? (
			<a href={idToUri(form.id)} target="_blank" rel="noreferrer noopener">
				{text}
			</a>
		) : text;
};

const createNode = (form: FormListing, idToUri?: (uri: string) => string): Hierarchy =>
	({ name: form.id, label: getLabel(form, idToUri), children: [] });

const formsToHierarchy = (
	forms: FormListing[],
	id: string,
	idToUri?: (uri: string) => string
) => {
	const formsById = dictionarifyByKey(forms, "id");
	let base: Hierarchy | undefined;

	const idToNode: Record<string, Hierarchy> = {};

	forms.forEach(form => {
		const node: Hierarchy = idToNode[form.id] || createNode(form, idToUri);
		if (node.name === id) {
			node.gProps = { className: "base" };
			base = node;
		}
		const parentId = form.baseFormID || form.fieldsFormID;
		if (parentId) {
			const parentNode = idToNode[parentId] || createNode(formsById[parentId], idToUri);
			!parentNode.children.includes(node) && parentNode.children.push(node);
			node.parent = parentNode;
			idToNode[parentId] = parentNode;
		}
	});

	let iterated = base;
	while (iterated) {
		if (iterated.parent) {
			iterated = iterated.parent;
		} else {
			return iterated;
		}
	}
	return undefined;
};

export const HierarchyButton = ({ master, className }: { master?: MaybeError<Master> } & Classable) => {
	const [hierarchy, setHierarchy] = React.useState<Hierarchy | undefined>(undefined);
	const [modalOpen, openModal, closeModal] = useBooleanSetter(false);

	const { formService, lang, translations, theme, idToUri } = React.useContext(Context);
	const { Glyphicon } = theme;

	const abortRef = React.useRef<AbortController>();

	React.useEffect(() => {
		const getHierarchy = async () => {
			if (!master || !isValid(master) || !master.id) {
				return;
			}

			const forms = await runAbortable(signal => formService.getForms(lang, signal), abortRef);
			if (isSignalAbortError(forms)) {
				return;
			}
			const hierarchy = formsToHierarchy(forms, master.id, idToUri);
			setHierarchy(hierarchy);
		};
		getHierarchy();
	}, [formService, idToUri, lang, master]);

	if (!hierarchy || !master || !isValid(master) || !master.id) {
		return null;
	}

	const btnClassName = classNames(hierarchyNmpsc("button"), className);
	return <>
		<Tooltip tooltip={translations["editor.hierarchy.help"]} id="hierarchy-help">
			<Button small onClick={openModal} className={btnClassName} disabled={hierarchy === undefined}>
				<Glyphicon glyph="list-alt" />
			</Button>
		</Tooltip>
		{ modalOpen && <HierarchyModal hierarchy={hierarchy!} onHide={closeModal} /> }
	</>;
};

const useComputeMaxWidth = (ref: React.RefObject<HTMLElement>) => {
	const [maxWidth, setMaxWidth] = React.useState(400);
	React.useEffect(() => {
		if (!ref.current) {
			return;
		}
		new ResizeObserver(() => {
			const bounds = ref.current?.getBoundingClientRect();
			if (!bounds) {
				return;
			}
			setMaxWidth(bounds.width);
		}).observe(ref.current);
	}, [ref]);
	return maxWidth;
};

const pathProps = { className: hierarchyNmpsc("link") };

const HierarchyModal = ({ hierarchy, onHide }: { hierarchy: Hierarchy, onHide: () => void }) => {
	const { translations } = React.useContext(Context);
	const ref = React.useRef<HTMLDivElement>(null);
	const maxWidth = useComputeMaxWidth(ref);
	const depth = getDepth(hierarchy);
	const maxChildren = getMaxChildren(hierarchy);
	const height = maxChildren * (LABEL_HEIGHT * 2 + LABEL_PADDING + NODES_PADDING);
	return (
		<GenericModal onHide={onHide}
		              className={hierarchyNmpsc("modal")}
		              bodyRef={ref}
		              header={translations["editor.hierarchy.title"]}>
			<Tree data={hierarchy}
			      labelProp="label"
			      pathProps={pathProps}
			      height={height}
			      width={Math.min(depth * 200, maxWidth)} />
		</GenericModal>
	);
};

const getDepth = (node: Hierarchy): number => {
	return 1 + Math.max(...node.children.map(getDepth), 0);
};

const getMaxChildren = (node: D3HierarchyData): number => {
	return Math.max(node.children.reduce((sum, c) => sum + getMaxChildren(c), 0), 1);
};
