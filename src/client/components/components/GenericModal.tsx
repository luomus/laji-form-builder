import * as React from "react";
import { Context } from "src/client/components/Context";
import { Classable, HasChildren } from "src/client/components/components";
import { classNames, gnmspc } from "src/client/utils";

export type GenericModalProps = {
	onHide: () => void;
	header?: string;
	bodyRef?: React.Ref<HTMLDivElement>
} & HasChildren & Classable

export const GenericModal = ({onHide, children, header, className, bodyRef}: GenericModalProps) => {
	const {theme} = React.useContext(Context);
	const {Modal} = theme;
	return (
		<Modal show={true} onHide={onHide} dialogClassName={classNames(gnmspc(), gnmspc("wide-modal"), className)}>
			<Modal.Header closeButton={true}>
				<h4>{header}</h4>
			</Modal.Header>
			<Modal.Body>
				<div ref={bodyRef}>
					{ children }
				</div>
			</Modal.Body>
		</Modal>
	);
};

