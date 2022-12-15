import * as React from "react";
import { Master } from "../../../model";
import { Context } from "../Context";
import { makeCancellable, nmspc } from "../../utils";
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
		<DiffsViewer diffs={getDiff(remoteMaster, master)} />
	);
});

export default DiffViewerModal;


type NonArrayDiff = DiffNew<unknown> | DiffEdit<unknown> | DiffDeleted<unknown>;

const getDiff = memoize((obj1: unknown, obj2: unknown) => {
	const flattenArrays = (diffs: Diff<unknown>[]): NonArrayDiff[] => {
		return diffs.reduce((_diffs, d) => {
			if (d.kind === "A") {
				_diffs.push({...d.item, path: [...(d.path || []), d.index]} as NonArrayDiff);
			} else {
				_diffs.push(d);
			}
			return _diffs;
		}, [] as NonArrayDiff[]);
	};
	const diffs =	diff(obj1, obj2);
	return diffs ? flattenArrays(diffs) : [];
});

const DiffPath = ({path}: Diff<unknown>) => <span>{path?.join(".")}</span>;

const DiffKindMapper = (diff: Diff<unknown>) => {
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

const DiffNewViewer = (diff: DiffNew<unknown>) => {
	return <span>{JSON.stringify(diff.rhs)}</span>;
};

const DiffDeletedViewer = (diff: DiffDeleted<unknown>) => {
	return <span>{JSON.stringify(diff.lhs)}</span>;
};

const DiffEditViewer = (diff: DiffEdit<unknown>) => {
	return <span>{`${JSON.stringify(diff.lhs)} ➞ ${JSON.stringify(diff.rhs)}`}</span>;
};

const diffNmspc = nmspc("diff");

const mapDiffClassName = (kind: Diff<unknown>["kind"]) => {
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

const DiffViewerRow = (diff: Diff<unknown>) => (
	<tr className={mapDiffClassName(diff.kind)}>
		<th><DiffPath {...diff} /></th>
		<td>
			<DiffKindMapper {...diff} />
		</td>
	</tr>
);

const DiffsViewer = ({diffs}: {diffs: Diff<unknown>[]}) => {
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
