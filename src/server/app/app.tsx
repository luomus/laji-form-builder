import LajiFormBuilder from "../../client/components/Builder";
import properties from "../../../properties.json";
import * as React from "react";
import { render } from "react-dom";
import LajiForm from "laji-form/lib/components/LajiForm";
import lajiFormBs3 from "../../client/themes/bs3";
import ApiClientImplementation from "./ApiClientImplementation";

import "../../client/styles";

function getJsonFromUrl() {
	const type = (value: any | string): any => {
		try {
			return JSON.parse(value);
		} catch (e) {
			return value;
		}
	};

	const query = location.search.substr(1);
	const result = {} as any;
	query.split("&").forEach(function(part) {
		const item = part.split("=");
		result[item[0]] = type(decodeURIComponent(item[1]));
	});
	return result;
}

const query = getJsonFromUrl();
const {lang = "fi", ..._query} = query;

const id = location.pathname.substr(1);

const apiClient = new ApiClientImplementation(
	"https://apitest.laji.fi/v0",
	properties.accessToken,
	properties.userToken,
	lang
);

async function main() {
	const form = await apiClient.fetch(`/forms/${id}`, {lang, format: "schema"}).then(response => response.json());
	const formData = form?.options?.prepopulatedDocument || {};

	const LajiFormApp = () => {
		const [_form, onChange] = React.useState(form);
		const [_lang, onLangChange] = React.useState(lang);
		return (
			<React.Fragment>
				<LajiForm {..._form}
					lang={_lang}
					formData={formData}
					apiClient={apiClient}
					theme={lajiFormBs3}
					uiSchemaContext={{}}
					className={_lang}
				/>
				<LajiFormBuilder id={id}
					lang={lang}
					{..._query}
					{...properties}
					onChange={onChange}
					onLangChange={onLangChange}
					apiClient={apiClient}
					theme={lajiFormBs3}
					primaryDataBankFormID="MHL.70"
					secondaryDataBankFormID="MHL.68"
				/>
			</React.Fragment>
		);
	};

	render(
		React.createElement(LajiFormApp),
		document.querySelector("#app")
	);
}

main();

// For dev server hot reload
if ((module as any).hot) {
	  (module as any).hot.accept();
}
