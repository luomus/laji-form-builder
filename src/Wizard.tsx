import React from "react";
import { HasChildren, JSONEditor } from "./components";
import { Context } from "./Context";
import MetadataService from "./metadata-service";
import { Field, Master } from "./model";
import { JSONSchema } from "./utils";

type FormCreatorWizardOption = "dataset" | "json";

const datasetOptions: Record<FormCreatorWizardOption, [string, any]> = {
	"dataset": [
		"Wizard.option.dataset",
		FormCreatorDataset
	],
	"json": [
		"Wizard.option.json",
		FormCreatorJSON
	],
};

export const FormCreatorWizard = ({onCreate}: FormCreatorProps) => {
	const {theme, translations} = React.useContext(Context);
	const {Modal, ButtonGroup} = theme;
	const onHide = React.useCallback(() => {}, []);
	const [option, setOption] = React.useState<FormCreatorWizardOption>();
	const NextStep = option && datasetOptions[option][1] || <div />;
	return (
		<Modal onHide={onHide} show={true}>
			<Modal.Header>{translations["Wizard.header"]}</Modal.Header>
			<Modal.Body>
				{!option ? (
					<ButtonGroup vertical>
						{(Object.keys(datasetOptions) as FormCreatorWizardOption[]).map(key =>
							<FormCreatorWizardOptionButton key={key}
														   onSelect={setOption}
														   option={key}>
								{translations[datasetOptions[key][0]]}
							</FormCreatorWizardOptionButton>
						)}
					</ButtonGroup>
				) : (
					<NextStep onCreate={onCreate}/>
				)}
			</Modal.Body>
		</Modal>
	);
};

interface FormCreatorWizardOptionButtonProps extends HasChildren {
	option: FormCreatorWizardOption;
	onSelect: (option: FormCreatorWizardOption) => void;
}
const FormCreatorWizardOptionButton = ({children, option, onSelect}: FormCreatorWizardOptionButtonProps) => {
	const onClick = React.useCallback(() => onSelect(option), [option, onSelect]);
	const {Button} = React.useContext(Context).theme;
	return <Button onClick={onClick}>{children}</Button>;
};

interface FormCreatorProps {
	onCreate: (form: Master) => void;
}

function FormCreatorDataset () {
	return <div />;
}

const prepareImportedJSON = (json: any) => {
	const _json = JSON.parse(JSON.stringify(json));
	delete _json.id;
	return _json;
};

type FormCreatorJSONProps = FormCreatorProps;
function FormCreatorJSON({onCreate}: FormCreatorJSONProps) {
	const [json, setJSON] = React.useState();
	const [valid, setValid] = React.useState(false);
	const {translations, theme} = React.useContext(Context);
	const {Button} = theme;
	const onClick = React.useCallback(() => onCreate(prepareImportedJSON(json) as unknown as Master), [json, onCreate]);

	// Focus on mount.
	const ref = React.useRef<HTMLTextAreaElement>(null);
	React.useEffect(() => {console.log(ref.current);  ref.current?.focus();}, []);

	return (
		<React.Fragment>
			<JSONEditor value={json} onChange={setJSON} rows={20} onValidChange={setValid} live={true} ref={ref} />
			<Button onClick={onClick} variant={"success"} disabled={!json || !valid}>{translations["Wizard.option.json.import"]}</Button>
		</React.Fragment>
	);
}
