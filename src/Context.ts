import * as React from "react";
import ApiClient from "laji-form/lib/ApiClient";
import { Lang } from "./model";
import MetadataService from "./service/metadata-service";
import FormService from "./service/form-service";
import { Theme } from "./themes/theme";

export interface ContextProps {
	apiClient: ApiClient;
	lang: Lang;
	translations: {[key: string]: string};
	metadataService: MetadataService;
	formService: FormService;
	theme: Theme;
}
export const Context = React.createContext<ContextProps> ({} as ContextProps);
