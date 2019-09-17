import * as React from "react";
const LajiForm = require("laji-form/lib/components/LajiForm").default;

export default class LajiFormBuilder extends React.Component {
	render() {
		return <LajiForm {...this.props} />;
	}
}
