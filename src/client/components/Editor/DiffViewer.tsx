import * as React from "react";
import { Master, JSON } from "../../../model";
import { Context } from "../Context";
import { gnmspc, makeCancellable, nmspc } from "../../utils";
import diff, { Diff, DiffDeleted, DiffEdit, DiffNew } from "deep-diff";
import memoize from "memoizee";

export type DiffViewerProps = {
	master: Master;
}

const DiffViewerModal = React.memo(function DiffViewerModal({master}: DiffViewerProps) {
	const {formService} = React.useContext(Context);
	const [remoteMaster, setRemoteMaster] = React.useState<Master | undefined>(undefined);
	React.useEffect(() => {
		if (!master.id) {
			return;
		}
		const promise = makeCancellable(formService.getMaster(master.id).then(setRemoteMaster));
		return promise.cancel;
	}, [formService, master.id]);
	return (
		<DiffsViewer diffs={getDiff(remoteMaster as JSON, master as JSON)} />
	);
});

export default DiffViewerModal;

type NonArrayDiff = DiffNew<JSON> | DiffEdit<JSON> | DiffDeleted<JSON>;

export const getDiff = memoize((obj1: JSON, obj2: JSON) => {
	// The diff is used for JSON only. Undefined keys will be removed when the JSON is stringified,
	// so we filter them out here.
	const mapUndefined = (diff: NonArrayDiff): NonArrayDiff | undefined => {
		if (diff.kind === "N" && diff.rhs === undefined) {
			return undefined;
		}
		if (diff.kind === "E" && diff.rhs === undefined) {
			return {...diff, kind: "D"};
		}
		return diff;
	};

	const flattenArrays = (diffs: Diff<JSON>[]): NonArrayDiff[] => {
		return diffs.reduce((_diffs, d) => {
			const diff = mapUndefined(d.kind === "A"
				?	{...d.item, path: [...(d.path || []), d.index]} as NonArrayDiff
				: d);

			diff && _diffs.push(diff);
			return _diffs;
		}, [] as NonArrayDiff[]);
	};
	const diffs =	diff(obj1, obj2);
	return diffs ? flattenArrays(diffs) : [];
});

const DiffPath = ({path}: Diff<JSON>) => <span>{path?.join(".")}</span>;

const DiffKindMapper = (diff: Diff<JSON>) => {
	switch (diff.kind) {
	case "N":
		return <DiffNewViewer {...diff} />;
	case "D":
		return <DiffDeletedViewer {...diff} />;
	case "E":
		return <DiffEditViewer {...diff} />;
	default:
		 return null;
	}
};

const prettyJSONClassName = gnmspc("pretty-json");
const PrettyJSON = ({json}: {json: JSON}) => (
	<React.Fragment>{
		JSON.stringify(json, undefined, 2).split("\n").map((v, i) => <p key={i} className={prettyJSONClassName}>{v}</p>)
	}</React.Fragment>
);

const DiffNewViewer = (diff: DiffNew<JSON>) => <PrettyJSON json={diff.rhs} />;

const DiffDeletedViewer = (diff: DiffDeleted<JSON>) => <PrettyJSON json={diff.lhs} />;

const DiffEditViewer = (diff: DiffEdit<JSON>) => (
	<React.Fragment>
		<PrettyJSON json={diff.lhs} />{" ➞ "}<PrettyJSON json={diff.rhs} />
	</React.Fragment>
);

const diffNmspc = nmspc("diff");

const mapDiffClassName = (kind: Diff<JSON>["kind"]) => {
	switch (kind) {
	case "N":
		return diffNmspc("new");
	case "D":
		return diffNmspc("delete");
	case "E":
		return diffNmspc("edit");
	default:
		 return "";
	}
};

const DiffViewerRow = (diff: Diff<JSON>) => (
	<tr className={mapDiffClassName(diff.kind)}>
		<th><DiffPath {...diff} /></th>
		<td>
			<DiffKindMapper {...diff} />
		</td>
	</tr>
);

const DiffsViewer = ({diffs}: {diffs: Diff<JSON>[]}) => {
	const {theme} = React.useContext(Context);
	const {Table} = theme;
	return (
		<Table bordered condensed className={diffNmspc()}>
			<tbody>
				{diffs.map(d => <DiffViewerRow key={d.path?.join() + d.kind} {...d}/>)}
			</tbody>
		</Table>
	);
};
