import * as React from "react";
import { Lang } from "../../model";
import MetadataService from "../../services/metadata-service";
import FormService from "../services/form-service";
import { Theme } from "../themes/theme";
import { Notifier } from "laji-form/lib/components/LajiForm";
import ApiClient from "../../api-client";

export interface ContextProps {
	apiClient: ApiClient;
	lang: Lang;
	editorLang: Lang;
	translations: Record<string, string>;
	metadataService: MetadataService;
	formService: FormService;
	theme: Theme;
	notifier: Notifier;
}
export const Context = React.createContext<ContextProps> ({} as ContextProps);
