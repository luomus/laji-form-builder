import React from "react";
import LajiForm from "./LajiForm";
import _LajiForm from "laji-form/lib/components/LajiForm";
import { ButtonProps } from "laji-form/lib/themes/theme";
import { HasChildren, JSONEditor } from "./components";
import { Context } from "./Context";
import { Master } from "./model";
import { JSONSchema } from "./utils";

interface WizardStep {
	label: string;
	component: React.ComponentType<WizardStepProps>;
	children?: WizardStepChildren;
}
type WizardStepChildren = Record<string, WizardStep>;

const wizardSteps: WizardStepChildren = {
	"create": {
		label: "Wizard.header",
		component: WizardStart,
		children: {
			"json": {
				label: "Wizard.option.json",
				component: FormCreatorJSON
			},
			"databank": {
				label: "Wizard.option.databank",
				component: FormCreatorDatabank
			}
		}
	}
};
type WizardStepChildrenGuaranteed = WizardStep & {children: WizardStepChildren}

const getStep = (steps: string[]) => steps.reduce<WizardStep>(
	(wizardStep: WizardStepChildrenGuaranteed, stepName) => wizardStep.children[stepName],
	{children: wizardSteps} as WizardStep
);

export const FormCreatorWizard = ({onCreate, ...config}: FormCreatorProps) => {
	const {theme} = React.useContext(Context);
	const {Modal, Breadcrumb} = theme;
	const onHide = React.useCallback(() => {}, []);
	const [stepsTaken, setStepsTaken] = React.useState<string[]>(["create"]);
	const takeStep = React.useCallback(step => setStepsTaken([...stepsTaken, step]), [stepsTaken]);
	const wizardStep = stepsTaken.reduce<WizardStep>((step: WizardStepChildrenGuaranteed, child) => step.children[child], {children: wizardSteps} as WizardStep);
	const Step = wizardStep.component;
	return (
		<Modal onHide={onHide} show={true}>
			<Modal.Header>
				<Breadcrumb>{stepsTaken.map((step, i) =>
					<BreadcrumbItem key={step} setStepsTaken={setStepsTaken} steps={stepsTaken.slice(0, i + 1)} />
				)}</Breadcrumb>
			</Modal.Header>
			<Modal.Body>
				<Step onCreate={onCreate} takeStep={takeStep} {...config} />
			</Modal.Body>
		</Modal>
	);
};

function BreadcrumbItem({setStepsTaken, steps}: {setStepsTaken: React.Dispatch<React.SetStateAction<string[]>>, steps: string[]}) {
	const {theme, translations} = React.useContext(Context);
	const {Breadcrumb} = theme;
	const onClick = React.useCallback(() => setStepsTaken(steps), [setStepsTaken, steps]);
	const wizardStep = getStep(steps);
	return <Breadcrumb.Item onClick={onClick}>{translations[wizardStep.label]}</Breadcrumb.Item>;
}

function WizardStart({takeStep}: WizardStepProps) {
	const {theme, translations} = React.useContext(Context);
	const {ButtonGroup} = theme;
	const wizardsFirstSteps = wizardSteps.create.children as WizardStepChildren;
	return (
		<ButtonGroup vertical>
			{(Object.keys(wizardsFirstSteps)).map(key =>
				<FormCreatorWizardOptionButton key={key}
				                               onSelect={takeStep}
				                               option={key}>
					{translations[wizardsFirstSteps[key].label]}
				</FormCreatorWizardOptionButton>
			)}
		</ButtonGroup>
	);
}

interface FormCreatorWizardOptionButtonProps extends HasChildren {
	option: string;
	onSelect: (option: string) => void;
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

interface WizardStepProps extends FormCreatorProps {
	takeStep: (step: string) => void;
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

function FormCreatorJSON({onCreate}: WizardStepProps) {
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

interface FormCreatorDatabankProps extends WizardStepProps {
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
