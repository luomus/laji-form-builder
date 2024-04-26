import * as React from "react";
import { Lang } from "src/model";
import MetadataService from "src/services/metadata-service";
import FormService from "src/client/services/form-service";
import { Theme } from "src/client/themes/theme";
import { Notifier } from "@luomus/laji-form/lib/components/LajiForm";
import ApiClient from "src/api-client";
import { BuilderProps } from "src/client/components/Builder";

export interface ContextProps {
	apiClient: ApiClient;
	lang: Lang;
	editorLang: Lang;
	translations: Record<string, string>;
	metadataService: MetadataService;
	formService: FormService;
	theme: Theme;
	notifier: Notifier;
	idToUri?: BuilderProps["idToUri"]
}
export const Context = React.createContext<ContextProps> ({} as ContextProps);
