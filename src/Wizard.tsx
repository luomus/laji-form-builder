import React from "react";
import LajiForm from "./LajiForm";
import _LajiForm from "laji-form/lib/components/LajiForm";
import { ButtonProps } from "laji-form/lib/themes/theme";
import { HasChildren, JSONEditor } from "./components";
import { Context } from "./Context";
import { Master } from "./model";
import { JSONSchema } from "./utils";

type FormCreatorWizardOption = "databank" | "json";

const databankOptions: Record<FormCreatorWizardOption, [string, any]> = {
	"json": [
		"Wizard.option.json",
		FormCreatorJSON
	],
	"databank": [
		"Wizard.option.databank",
		FormCreatorDatabank
	],
};

export const FormCreatorWizard = ({onCreate, ...config}: FormCreatorProps) => {
	const {theme, translations} = React.useContext(Context);
	const {Modal, ButtonGroup, Breadcrumb} = theme;
	const onHide = React.useCallback(() => {}, []);
	const [option, setOption] = React.useState<FormCreatorWizardOption>();
	const NextStep = option && databankOptions[option][1] || <div />;
	return (
		<Modal onHide={onHide} show={true}>
			<Modal.Header>{translations["Wizard.header"]}</Modal.Header>
			<Modal.Body>
				{!option ? (
					<ButtonGroup vertical>
						{(Object.keys(databankOptions) as FormCreatorWizardOption[]).map(key =>
							<FormCreatorWizardOptionButton key={key}
														   onSelect={setOption}
														   option={key}>
								{translations[databankOptions[key][0]]}
							</FormCreatorWizardOptionButton>
						)}
					</ButtonGroup>
				) : (
					<NextStep onCreate={onCreate} {...config} />
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
	onCreate: (form: Omit<Master, "id">) => void;
	primaryDataBankFormID: string;
	secondaryDataBankFormID: string;
}

const prepareImportedJSON = (json: any) => {
	const _json = JSON.parse(JSON.stringify(json));
	delete _json.id;
	return _json;
};

const SubmitButton = (props: ButtonProps) => {
	const {theme, translations} = React.useContext(Context);
	const {Button} = theme;
	return <Button variant={"success"} {...props}>{translations["Wizard.option.json.import"]}</Button>;
};

function FormCreatorJSON({onCreate}: FormCreatorProps) {
	const [json, setJSON] = React.useState();
	const [valid, setValid] = React.useState(false);
	const onClick = React.useCallback(() => onCreate(prepareImportedJSON(json) as unknown as Master), [json, onCreate]);

	// Focus on mount.
	const ref = React.useRef<HTMLTextAreaElement>(null);
	React.useEffect(() => ref.current?.focus(), []);

	return (
		<React.Fragment>
			<JSONEditor value={json} onChange={setJSON} rows={20} onValidChange={setValid} live={true} ref={ref} />
			<SubmitButton onClick={onClick} disabled={!json || !valid} />

		</React.Fragment>
	);
}

interface FormCreatorDatabankProps extends FormCreatorProps {
	primaryDataBankFormID: string;
	secondaryDataBankFormID: string;
}

function FormCreatorDatabank({onCreate, primaryDataBankFormID, secondaryDataBankFormID}: FormCreatorDatabankProps) {
	const {translations} = React.useContext(Context);
	const submitRef = React.useRef<_LajiForm>(null);
	const schema = JSONSchema.object({
		name: JSONSchema.String({title: translations["Wizard.databank.form.name"]}),
		collectionID: JSONSchema.String({title: translations["Wizard.databank.form.collectionID"]}),
		primary: JSONSchema.Boolean({title: translations["Wizard.databank.form.primary"], default: true})
	}, {required: ["name", "collectionID"]});
	const uiSchema = {
		primary: {
			"ui:options": {
				allowUndefined: false
			}
		}
	};
	const onSubmit = React.useCallback(() => {
		submitRef.current?.submit();
	}, [submitRef]);
	const onLajiFormSubmit = React.useCallback(({formData: {name, collectionID, primary}}: {formData: {name: string, collectionID: string, primary: boolean}}) => onCreate({
		name,
		collectionID,
		baseFormID: primary
			? primaryDataBankFormID
			: secondaryDataBankFormID
	}), [onCreate, primaryDataBankFormID, secondaryDataBankFormID]);
	return (
		<LajiForm schema={schema} uiSchema={uiSchema} ref={submitRef} onSubmit={onLajiFormSubmit}>
			<SubmitButton onClick={onSubmit} />
		</LajiForm>
	);
}
