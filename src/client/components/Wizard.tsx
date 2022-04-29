import React from "react";
import LajiForm from "./LajiForm";
import _LajiForm from "laji-form/lib/components/LajiForm";
import { FormJSONEditor, HasChildren, Spinner, Stylable, SubmitButton } from "./components";
import { Context } from "./Context";
import { FormListing, Master, FormDeleteResult } from "../../model";
import { JSONSchema } from "../../utils";
import { classNames, gnmspc, nmspc } from "../utils";
import { translate as translateKey } from "laji-form/lib/utils";
import { ButtonProps, ButtonGroupProps } from "../themes/theme";

interface WizardStep {
	label: string;
	component: React.ComponentType<WizardStepProps>;
	children?: WizardStepChildren;
	variant?: ButtonProps["variant"];
}
type WizardStepChildren = Record<string, WizardStep>;

const wizardCreateStep: WizardStep = {
	label: "Wizard.header",
	component: GenericWizardStepChooser,
	variant: "primary",
	children: {
		json: {
			label: "Wizard.option.json",
			component: FormCreatorJSON,
		},
		databank: {
			label: "Wizard.option.databank",
			component: FormCreatorDatabank,
		}
	}
};

const wizardCreateOrListStep: WizardStep = {
	label: "Wizard.createOrList",
	component: WizardCreateOrList,
	children: {
		create: wizardCreateStep,
	}
};

type WizardStepChildrenGuaranteed = WizardStep & {children: WizardStepChildren}


const wizardNmspc = nmspc("creator-wizard");

export const FormCreatorWizard = ({onCreate, allowList = false, ...config}: FormCreatorProps) => {
	const {theme} = React.useContext(Context);
	const {Modal, Breadcrumb} = theme;
	const onHide = React.useCallback(() => {}, []);
	const [stepsTaken, setStepsTaken] = React.useState<string[]>([allowList ? "createOrList" : "create"]);
	const takeStep = React.useCallback(step => setStepsTaken([...stepsTaken, step]), [stepsTaken]);
	const rootStep: Pick<WizardStep, "children"> = {
		children: allowList
			? {createOrList: wizardCreateOrListStep}
			: {create: wizardCreateStep}
	};
	const wizardStep = stepsTaken.reduce<WizardStep>(
		(step: WizardStepChildrenGuaranteed, child) => step.children[child],
		rootStep as WizardStep);
	const Step = wizardStep.component;
	return (
		<Modal onHide={onHide} show={true} dialogClassName={classNames(gnmspc(), gnmspc("editor"))}>
			<Modal.Header>
				<Breadcrumb>{stepsTaken.map((step, i) =>
					<WizardBreadcrumbItem key={step}
					                setStepsTaken={setStepsTaken}
					                steps={stepsTaken.slice(0, i + 1)}
					                rootStep={rootStep}
					                active={i === stepsTaken.length - 1} />
				)}</Breadcrumb>
			</Modal.Header>
			<Modal.Body>
				<div className={wizardNmspc("")}>
					<Step onCreate={onCreate} takeStep={takeStep} steps={wizardStep.children} {...config} />
				</div>
			</Modal.Body>
		</Modal>
	);
};

function WizardBreadcrumbItem(
	{setStepsTaken, steps, rootStep, active}:
	{
		setStepsTaken: React.Dispatch<React.SetStateAction<string[]>>;
		steps: string[];
		rootStep: Pick<WizardStep, "children">;
		active?: boolean;
	}) {
	const {theme, translations} = React.useContext(Context);
	const {Breadcrumb} = theme;
	const onClick = React.useCallback(() => setStepsTaken(steps), [setStepsTaken, steps]);
	const getStep = (steps: string[]) => steps.reduce<WizardStep>(
		(wizardStep: WizardStepChildrenGuaranteed, stepName) => wizardStep.children[stepName],
		rootStep as WizardStep
	);
	const wizardStep = getStep(steps);
	return <Breadcrumb.Item onClick={onClick} active={active}>{translations[wizardStep.label]}</Breadcrumb.Item>;
}

function GenericWizardStepChooser(
	{takeStep, steps, style, buttonGroupProps}
	: WizardStepProps & Stylable & {buttonGroupProps: ButtonGroupProps}
) {
	const {theme, translations} = React.useContext(Context);
	const {ButtonGroup} = theme;
	return !steps
		? null
		: (
			<ButtonGroup vertical
			             style={style || {margin: "auto", width: "50%", display: "block"}}
			             {...(buttonGroupProps || {})}>
				{(Object.keys(steps)).map(key =>
					<FormCreatorWizardOptionButton key={key}
					                               onSelect={takeStep}
					                               variant={steps[key].variant}
					                               option={key}>
						{translations[steps[key].label]}
					</FormCreatorWizardOptionButton>
				)}
			</ButtonGroup>
		);
}

function WizardCreateOrList(props: WizardStepProps) {
	const steps = wizardCreateOrListStep.children as WizardStepChildren;
	const {create} = steps;
	return (
		<React.Fragment>
			<GenericWizardStepChooser {...props} steps={{create}} style={{}} buttonGroupProps={{block: true}} />
			<FormList onChoose={props.onChoose} />
		</React.Fragment>
	);
}

interface FormCreatorWizardOptionButtonProps extends HasChildren {
	option: string;
	onSelect: (option: string) => void;
	variant?: ButtonProps["variant"];
}

const FormCreatorWizardOptionButton = ({children, option, onSelect, variant}: FormCreatorWizardOptionButtonProps) => {
	const onClick = React.useCallback(() => onSelect(option), [option, onSelect]);
	const {Button} = React.useContext(Context).theme;
	return <Button onClick={onClick} className={wizardNmspc(`create-${option}`)} variant={variant}>{children}</Button>;
};

interface FormCreatorProps {
	onCreate: (form: Omit<Master, "id">, save?: boolean) => void;
	onChoose: (id: string) => void;
	primaryDataBankFormID: string;
	secondaryDataBankFormID: string;
	allowList?: boolean;
}

interface WizardStepProps extends FormCreatorProps {
	takeStep: (step: string) => void;
	steps?: WizardStepChildren;
}

const prepareImportedJSON = (json: any, translations: Record<string, string>) => {
	const removeId = json.id && confirm(translations["Wizard.option.json.removeId"]);
	if (removeId) {
		const _json = JSON.parse(JSON.stringify(json));
		delete _json.id;
		return _json;
	}
	return json;
};

function FormCreatorJSON({onCreate}: WizardStepProps) {
	const {translations} = React.useContext(Context);
	const useOnSubmit = (save?: boolean) => React.useCallback(
		(json: Master) => onCreate(prepareImportedJSON(json, translations), save),
		[save]
	);
	const onSubmit = useOnSubmit(true);
	const onSubmitDraft = useOnSubmit(false);
	return <FormJSONEditor onSubmit={onSubmit} onSubmitDraft={onSubmitDraft} className={wizardNmspc("json")} />;
}

interface FormCreatorDatabankProps extends WizardStepProps {
	primaryDataBankFormID: string;
	secondaryDataBankFormID: string;
}

function FormCreatorDatabank({onCreate, primaryDataBankFormID, secondaryDataBankFormID}: FormCreatorDatabankProps) {
	const {translations} = React.useContext(Context);
	const submitRef = React.useRef<_LajiForm>(null);
	const [saveOnSubmit, setSubmitType] = React.useState<boolean>(false);
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

	const onLajiFormSubmit = React.useCallback(
		({formData: {name, collectionID, primary}}:
		{formData: {name: string, collectionID: string, primary: boolean}}) => onCreate({
			name,
			collectionID,
			baseFormID: primary
				? primaryDataBankFormID
				: secondaryDataBankFormID
		}, saveOnSubmit),
		[saveOnSubmit, onCreate, primaryDataBankFormID, secondaryDataBankFormID]
	);

	const onSubmit = React.useCallback(() => {
		setSubmitType(true);
		submitRef.current?.submit();
	}, [setSubmitType, submitRef]);
	const onSubmitDraft = React.useCallback(() => {
		setSubmitType(false);
		submitRef.current?.submit();
	}, [setSubmitType, submitRef]);

	return (
		<LajiForm schema={schema} uiSchema={uiSchema} ref={submitRef} onSubmit={onLajiFormSubmit} autoFocus={true}>
			<SubmitButton onClick={onSubmit}>{translations["Save"]}</SubmitButton>
			<SubmitButton onClick={onSubmitDraft} variant="default">
				{translations["Wizard.option.json.import.draft"]}
			</SubmitButton>
		</LajiForm>
	);
}

const formSelectNmscp = nmspc("form-select");

function FormList({onChoose}: Pick<FormCreatorProps, "onChoose">) {
	const [forms, setForms] = React.useState<FormListing[] | undefined>(undefined);
	const {formService, theme, notifier, translations} = React.useContext(Context);
	const [loadingForms, setLoadingForms] = React.useState<Record<string, boolean>>({});

	const loadForms = React.useCallback(async () => {
		setForms(await formService.getForms());
	}, [formService]);

	React.useEffect(() => {
		loadForms();
	}, [loadForms]);

	const [displayedForms, setDisplayedForms] = React.useState<FormListing[] | undefined>(undefined);
	const [activeIdx, _setActiveIdx] = React.useState<number | undefined>(undefined);

	// Wrapper that guards that activeIdx stays in range.
	const setActiveIdx = React.useCallback((idx?: number) => {
		let nextIdx: number | undefined = idx;
		if (idx === undefined || idx < 0 || (displayedForms || []).length === 0) {
			nextIdx = undefined;
		} else if (idx >= (displayedForms || []).length) {
			nextIdx = (displayedForms || []).length - 1;
		}
		_setActiveIdx(nextIdx);
	}, [_setActiveIdx, displayedForms]);

	// Synchronizes activeIdx to be the last item if it drops out of range during filtering.
	React.useEffect(() => {
		setActiveIdx(activeIdx);
	}, [activeIdx, setActiveIdx, setDisplayedForms]);

	const {Panel, FormControl, ListGroup, Glyphicon} = theme;
	const onSelected = React.useCallback((f: FormListing) => onChoose(f.id), [onChoose]);

	const setFormLoading = React.useCallback((id: string, loading: boolean) => {
		setLoadingForms({...loadForms, [id]: loading});
	}, [loadForms, setLoadingForms]);

	const onDelete = React.useCallback(async (id) => {
		setFormLoading(id, true);
		let result: FormDeleteResult | undefined;
		try {
			result = await formService.delete(id);
		} catch (e) {
			notifier.error(translations["Delete.error"]);
		} finally {
			setFormLoading(id, false);
			if (result && result.affected > 0 && forms) {
				notifier.success(translations["Delete.success"]);
				setForms(forms.filter(f => f.id !== id));
			}
		}
	}, [formService, forms, notifier, setFormLoading, translations]);

	const onKeyDown = React.useCallback((e) => {
		switch (e.key) {
		case "ArrowDown":
			setActiveIdx(activeIdx === undefined
				? 0
				: activeIdx + 1
			);
			break;
		case "ArrowUp":
			setActiveIdx((activeIdx || 0) - 1);
			break;
		case "Enter":
			activeIdx !== undefined && displayedForms && onSelected(displayedForms[activeIdx]);
			break;
		}
	}, [activeIdx, displayedForms, onSelected, setActiveIdx]);

	const list = !forms
		? <Spinner />
		: (
			<ListGroup className={formSelectNmscp("list")}>{
				(displayedForms || []).map((f, idx) =>
					<FormListItem key={f.id}
					              {...f}
					              active={idx === activeIdx}
					              onSelected={onSelected}
					              onDelete={onDelete}
					              loading={loadingForms[f.id]} />)
			}</ListGroup>
		);

	const [searchValue, setSearchValue] = React.useState("");

	const filterForms = React.useCallback(() => {
		if (searchValue === "") {
			return setDisplayedForms(forms);
		}
		if (!forms) {
			return;
		}
		setDisplayedForms(forms.filter(f => (f.name + f.id).toLowerCase().match(searchValue.toLowerCase())));
	}, [forms, searchValue, setDisplayedForms]);


	React.useEffect(filterForms, [searchValue, forms, filterForms]);

	const onSearchChange = React.useCallback((e) => {
		setSearchValue(e.target.value);
	}, []);

	const search = (
		<div className={formSelectNmscp("input")} onKeyDown={onKeyDown}>
			<FormControl placeholder={translations["Wizard.list.search.placeholder"]}
			             autoFocus={true}
			             onChange={onSearchChange}
			             value={searchValue} />
			<Glyphicon glyph="search" />
		</div>
	);

	return (
		<Panel>
			<Panel.Heading>
				<h4>{translations["Wizard.list.header"]}</h4>
				{search}
			</Panel.Heading>
			{list}
		</Panel>
	);
}

function FormListItem(
	{onSelected, onDelete, loading, active, ...f}
	: {
		onSelected: (form: FormListing) => void,
		onDelete: (id: string) => void,
		loading: boolean,
		active?: boolean
	} & FormListing
) {
	const {theme, translations} = React.useContext(Context);
	const onClick = React.useCallback(() => {
		onSelected(f);
	}, [f, onSelected]);
	const _onDelete = React.useCallback(async (e) => {
		e.stopPropagation();
		if (confirm(translateKey(translations, "Wizard.list.delete.confirm", {name: f.name, id: f.id}))) {
			onDelete(f.id);
		}
	}, [f, onDelete, translations]);
	const {ListGroupItem} = theme;
	return (
		<ListGroupItem onClick={onClick} disabled={loading} className={formSelectNmscp("list-item")} active={active}>
			{f.name} ({f.id})
			{loading
				? <Spinner />
				: <span onClick={_onDelete} className={formSelectNmscp("list-item-delete")} />
			}
		</ListGroupItem>
	);
}
