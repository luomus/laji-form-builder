import * as React from "react";
import ApiClient from "laji-form/lib/ApiClient";
import { Lang } from "./LajiFormBuilder";
import MetadataService from "./metadata-service";

export interface ContextProps {
	apiClient: ApiClient;
	lang: Lang;
	translations: {[lang: string]: string};
	metadataService: MetadataService;
}
export const Context = React.createContext<Partial<ContextProps>> ({});

