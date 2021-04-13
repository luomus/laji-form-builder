import * as React from "react";
import ApiClient from "laji-form/lib/ApiClient";
import { Lang } from "./LajiFormBuilder";
import MetadataService from "./metadata-service";
import { Theme } from "./themes/theme";

export interface ContextProps {
	apiClient: ApiClient;
	lang: Lang;
	translations: {[lang: string]: string};
	metadataService: MetadataService;
	theme: Theme;
}
export const Context = React.createContext<ContextProps> ({} as ContextProps);

