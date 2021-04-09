import * as React from "react";
import LajiForm, { LajiFormProps } from "laji-form/lib/components/LajiForm";
import { Context } from "./Context";

export default (props: LajiFormProps) => {
	const {theme, lang} = React.useContext(Context);
	return <LajiForm
		renderSubmit={false}
		theme={theme}
		lang={lang}
		{...props}
	/>;
}
