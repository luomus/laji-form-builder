import * as React from "react";
import ApiClient from "./ApiClientImplementation";
import { Lang } from "./LajiFormBuilder";

export interface ContextProps {
	apiClient: ApiClient;
	lang: Lang;
	translations: {[lang: string]: string};
}
export const Context = React.createContext<Partial<ContextProps>> ({});

