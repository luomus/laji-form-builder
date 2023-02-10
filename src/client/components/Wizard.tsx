import React from "react";
import LajiForm from "./LajiForm";
import _LajiForm from "laji-form/lib/components/LajiForm";
import { SubmittableJSONEditor, HasChildren, Spinner, Stylable, Button, SearchInput } from "./components";
import { Context } from "./Context";
import { FormListing, Master, FormDeleteResult, isMaster } from "../../model";
import { JSONSchemaBuilder } from "../../utils";
import { classNames, gnmspc, isSignalAbortError, nmspc, runAbortable, useBooleanSetter } from "../utils";
import { immutableDelete, translate as translateKey } from "laji-form/lib/utils";
import { ButtonProps, ButtonGroupProps } from "../themes/theme";

interface WizardStep {
	label: string;
	component: React.ComponentType<WizardStepProps>;
	children?: WizardStepChildren;
	variant?: ButtonProps["variant"];
}
type WizardStepChildren = Record<string, WizardStep>;

const wizardCreateStep: WizardStep = {
	label: "wizard.header",
	component: GenericWizardStepChooser,
	variant: "primary",
	children: {
		json: {
			label: "wizard.option.json",
			component: FormCreatorJSON,
		},
		databank: {
			label: "wizard.option.databank",
			component: FormCreatorDatabank,
		},
		extend: {
			label: "wizard.option.extend",
			component: GenericWizardStepChooser,
			children: {
				copy: {
					label: "wizard.option.extend.copy",
					component: FormCreatorExtendWithMethod("copy")
				},
				extendFully: {
					label: "wizard.option.extend.extendFully",
					component: FormCreatorExtendWithMethod("fully")
				},
				extendFields: {
					label: "wizard.option.extend.extendFields",
					component: FormCreatorExtendWithMethod("fields")
				},
			}
		}
	}
};

type Method = "copy"  | "fully" | "fields";

const extendForm = (form: Master, method: Method): Master => {
	switch (method) {
	case "copy":
		return immutableDelete(form, "id");
	case "fully":
		return { baseFormID: form.id };
	case "fields":
		return { fieldsFormID: form.id };
	}
};

type FormCreatorExtendProps = WizardStepProps & {method: Method};
function FormCreatorExtend({onCreate, method}: FormCreatorExtendProps) {
	const {theme, translations, formService} = React.useContext(Context);
	const [chosen, onChoose] = React.useState<string>();
	const [form, setForm] = React.useState<Master>();
	const [loading, setLoading] = React.useState(false);
	const [displayModal, showModal, hideModal] = useBooleanSetter(false);

	const onSubmit = React.useCallback((form: Master, save: boolean) => {
		setLoading(true);
		onCreate(extendForm(form, method), save);
	}, [onCreate, method]);
	const onSubmitAndSave = React.useCallback(() => form && onSubmit(form, true), [onSubmit, form]);
	const onSubmitDraft = React.useCallback(() => form && onSubmit(form, false), [onSubmit, form]);

	const abortRef = React.useRef<AbortController>();
	React.useEffect(() => {
		const doAsync = async () => {
			if (!chosen) {
				abortRef.current?.abort();
				setLoading(false);
				return;
			}
			setLoading(true);
			let form: Master | DOMException;
			try {
				form = await runAbortable(signal => formService.getMaster(chosen, signal), abortRef);
			} finally {
				setLoading(false);
			}
			if (isSignalAbortError(form)) {
				return;
			}
			setForm(form);
			showModal();
		};

		doAsync();
	}, [chosen, formService, setLoading, showModal]);

	const {Modal} = theme;
	return <>
		<FormList onChoose={onChoose} />
		{displayModal && (
			<Modal show={true} onHide={hideModal} >
				<Modal.Body>
					<p>{translations["wizard.option.extend.saveOrPreview"]}</p>
					<Button onClick={onSubmitAndSave}
					        variant="primary"
					        disabled={loading}>{translations["save"]}</Button>
					<Button onClick={onSubmitDraft} variant="default"  disabled={loading}>
						{translations["wizard.option.json.import.draft"]}
					</Button>
				</Modal.Body>
			</Modal>
		)}
	</>;
}

function FormCreatorExtendWithMethod(method: Method) {
	return (props: Omit<FormCreatorExtendProps, "method">) => 
		<FormCreatorExtend {...props} method={method} />;
}

const wizardCreateOrListStep: WizardStep = {
	label: "wizard.createOrList",
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
		<Modal onHide={onHide} show={true} dialogClassName={classNames(gnmspc())}>
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
	return <>
		<GenericWizardStepChooser {...props} steps={{create}} style={{}} buttonGroupProps={{block: true}} />
		<FormList onChoose={props.onChoose} />
	</>;
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
	const removeId = json.id && confirm(translations["wizard.option.json.removeId"]);
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
		[save, translations] // eslint-disable-line react-hooks/exhaustive-deps
	);
	const onSubmit = useOnSubmit(true);
	const onSubmitDraft = useOnSubmit(false);
	return <SubmittableJSONEditor onSubmit={onSubmit}
	                              onSubmitDraft={onSubmitDraft}
					                      submitLabel={translations["save"]}
	                              className={wizardNmspc("json")}
	                              validator={isMaster} />;
}

interface FormCreatorDatabankProps extends WizardStepProps {
	primaryDataBankFormID: string;
	secondaryDataBankFormID: string;
}

function FormCreatorDatabank({onCreate, primaryDataBankFormID, secondaryDataBankFormID}: FormCreatorDatabankProps) {
	const {translations} = React.useContext(Context);
	const submitRef = React.useRef<_LajiForm>(null);
	const [saveOnSubmit, setSubmitType] = React.useState<boolean>(false);
	const schema = JSONSchemaBuilder.object({
		name: JSONSchemaBuilder.String({title: translations["wizard.databank.form.name"]}),
		collectionID: JSONSchemaBuilder.String({title: translations["wizard.databank.form.collectionID"]}),
		primary: JSONSchemaBuilder.Boolean({title: translations["wizard.databank.form.primary"], default: true})
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
			<Button onClick={onSubmit} variant="primary">{translations["save"]}</Button>
			<Button onClick={onSubmitDraft} variant="default">
				{translations["wizard.option.json.import.draft"]}
			</Button>
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

	const {Panel, ListGroup} = theme;
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
			notifier.error(translations["delete.error"]);
		} finally {
			setFormLoading(id, false);
			if (result && result.affected > 0 && forms) {
				notifier.success(translations["delete.success"]);
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

	return (
		<Panel>
			<Panel.Heading>
				<h4>{translations["wizard.list.header"]}</h4>
				<SearchInput onChange={setSearchValue}
				             onKeyDown={onKeyDown}
				             autoFocus={true} />
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
		if (confirm(translateKey(translations, "wizard.list.delete.confirm", {name: f.name, id: f.id}))) {
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
