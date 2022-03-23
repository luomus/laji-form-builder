import * as React from "react";
import ApiClient from "laji-form/lib/ApiClient";
import { Lang } from "../../model";
import MetadataService from "../../services/metadata-service";
import FormService from "../services/form-service";
import { Theme } from "../themes/theme";
import { Notifier } from "laji-form/lib/components/LajiForm";

export interface ContextProps {
	apiClient: ApiClient;
	lang: Lang;
	editorLang: Lang;
	translations: {[key: string]: string};
	metadataService: MetadataService;
	formService: FormService;
	theme: Theme;
	notifier: Notifier;
}
export const Context = React.createContext<ContextProps> ({} as ContextProps);
