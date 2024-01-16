import * as React from "react";
import { FormListing, Master } from "../../../model";
import { MaybeError, isValid  } from "../Builder";
import { Button, Classable, GenericModal, Tooltip } from "../components";
import { Context } from "../Context";
import { classNames, isSignalAbortError, nmspc, runAbortable, useBooleanSetter } from "../../utils";
import { Tree, Data as D3HierarchyData } from "react-tree-graph";
import { dictionarifyByKey } from "../../../utils";

type Hierarchy = D3HierarchyData & {
	label: string;
	parent?: Hierarchy;
	children: Hierarchy[];
};

type FormChildToParent = Record<string, string>;

const hierarchyNmpsc = nmspc("hierarchy");

const getLabel = (form: FormListing, idToUri?: (uri: string) => string) => {
	const text = <text>{`${form.id} (${form.name})`}</text>;
	return idToUri
		? (
			<a href={idToUri(form.id)} target="_blank" rel="noreferrer noopener">
				{text}
			</a>
		) : text;
};

const createNode = (form: FormListing, idToUri?: (uri: string) => string) =>
	({ name: form.id, label: getLabel(form, idToUri), children: [] });

const formChildToParentToFormsD3Hierarchy = (
	childToParent: FormChildToParent,
	id: string,
	forms: Record<string, FormListing>,
	idToUri?: (uri: string) => string
) => {
	if (!childToParent[id]) {
		return;
	}
	let base: Hierarchy;

	const idToNode: Record<string, Hierarchy> = {};
	Object.keys(childToParent).forEach((iteratedId: string) => {
		const parent = childToParent[iteratedId];
		const node: Hierarchy = idToNode[iteratedId] || createNode(forms[iteratedId], idToUri);
		if (node.name === id) {
			node.gProps = { className: "base" };
			base = node;
		}
		const parentNode = idToNode[parent] || createNode(forms[parent], idToUri);
		!parentNode.children.includes(node) && parentNode.children.push(node);

		node.parent = parentNode;

		idToNode[parent] = parentNode;
	});

	let iterated = base!;
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
	// undefined for loading, null for loaded but nonexistent
	const [hierarchy, setHierarchy] = React.useState<Hierarchy | null | undefined>(undefined);
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
			const childToparent: FormChildToParent = forms.reduce((childToParent, form) => {
				const parent = form.fieldsFormID || form.baseFormID;
				if (parent) {
					childToParent[form.id] = parent;
				}
				return childToParent;
			}, {} as FormChildToParent);
			if (!childToparent[master.id]) {
				setHierarchy(null);
			}
			const hierarchy = formChildToParentToFormsD3Hierarchy(
				childToparent, master.id, dictionarifyByKey(forms, "id"), idToUri
			);
			setHierarchy(hierarchy);
		};
		getHierarchy();
	}, [formService, idToUri, lang, master]);

	if (!hierarchy || !master || !isValid(master) ||  !master.id) {
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

const HierarchyModal = ({ hierarchy, onHide }: { hierarchy: Hierarchy, onHide: () => void }) => {
	const [maxWidth, setMaxWidth] = React.useState(400);
	const ref = React.useRef<HTMLDivElement>(null);
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
	const [depth, setDepth] = React.useState(0);
	React.useEffect(() => {
		setDepth(getDepth(hierarchy));
	}, [hierarchy]);
	return (
		<GenericModal onHide={onHide} className={hierarchyNmpsc("modal")} bodyRef={ref}>
			<Tree data={hierarchy} labelProp="label" height={300} width={Math.min(depth * 200, maxWidth)}/>
		</GenericModal>
	);
};

const getDepth = (node: Hierarchy): number => {
	return 1 + Math.max(...node.children.map(getDepth), 0);
};
