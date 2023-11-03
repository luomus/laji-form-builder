import * as React from "react";
import LajiForm, { LajiFormProps } from "@luomus/laji-form/lib/components/LajiForm";
import { Context } from "./Context";

export default React.forwardRef<LajiForm, LajiFormProps>((props: LajiFormProps, ref) => {
	const {theme, lang} = React.useContext(Context);
	return <LajiForm
		renderSubmit={false}
		theme={theme}
		lang={lang}
		{...props}
		ref={ref}
	/>;
});
