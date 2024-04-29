import * as React from "react";
import { Context } from "src/client/components/Context";
import LajiFormContext from "@luomus/laji-form/lib/ReactContext";
import { Help as LJHelp } from "@luomus/laji-form/lib/components/components";

export const Help = (props: any) => {
	const context = React.useContext(Context);
	return (
		<div className="laji-form" style={{display: "initial"}}>
			<LajiFormContext.Provider value={context}>
				<LJHelp  {...props} />
			</LajiFormContext.Provider>
		</div>
	);
};
