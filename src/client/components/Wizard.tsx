import React from "react";
import LajiForm from "./LajiForm";
import _LajiForm from "@luomus/laji-form/lib/components/LajiForm";
import { Context } from "./Context";
import { FormListing, Master, FormDeleteResult, isMaster } from "src/model";
import { JSONSchemaBuilder } from "src/utils";
import { classNames, gnmspc, isSignalAbortError, nmspc, runAbortable, useBooleanSetter } from "src/client/utils";
import { immutableDelete, translate as translateKey } from "@luomus/laji-form/lib/utils";
import { ButtonProps, ButtonGroupProps, ListGroupItemProps } from "src/client/themes/theme";
import {
	HasChildren, Stylable, SubmittableJSONEditor, Spinner, Button, SearchInput, Help
} from "src/client/components/components";

interface WizardStep {
	label: string;
	help?: string;
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
					help: "wizard.option.extend.extendFully.help",
					component: FormCreatorExtendWithMethod("fully")
				},
				extendFields: {
					label: "wizard.option.extend.extendFields",
					help: "wizard.option.extend.extendFields.help",
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
	const [chosen, onSelected] = React.useState<string>();
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
		<FormList onSelected={onSelected} />
		{displayModal && (
			<Modal show={true} onHide={hideModal} >
				<Modal.Body>
					<p>{translations["wizard.option.extend.saveOrPreview"]}</p>
					<Button onClick={onSubmitAndSave}
					        variant="primary"
					        disabled={loading}>{translations["save"]}</Button>
					<Button onClick={onSubmitDraft} variant="default" disabled={loading}>
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
	const context = React.useContext(Context);
	const {theme, translations} = context;
	const {ButtonGroup} = theme;
	return !steps
		? null
		: (
			<ButtonGroup vertical
			             style={style || {margin: "auto", width: "50%", display: "block"}}
			             {...(buttonGroupProps || {})}>
				{(Object.keys(steps)).map(key => {
					const {label, help} = steps[key];
					return (
						<FormCreatorWizardOptionButton key={key}
						                               onSelect={takeStep}
						                               variant={steps[key].variant}
						                               option={key}>
							{translations[label]}
							{help && <Help help={translations[help]} id={label} />
							}
						</FormCreatorWizardOptionButton>
					);
				}
				)}
			</ButtonGroup>
		);
}

function WizardCreateOrList(props: WizardStepProps) {
	const steps = wizardCreateOrListStep.children as WizardStepChildren;
	const {create} = steps;
	return <>
		<GenericWizardStepChooser {...props} steps={{create}} style={{}} buttonGroupProps={{block: true}} />
		<FormList onSelected={props.onSelected} />
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
	onSelected: (id: string) => void;
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
	const schema = React.useMemo(() => JSONSchemaBuilder.object({
		name: JSONSchemaBuilder.String({title: translations["wizard.databank.form.name"]}),
		collectionID: JSONSchemaBuilder.String({title: translations["wizard.databank.form.collectionID"]}),
		primary: JSONSchemaBuilder.Boolean({title: translations["wizard.databank.form.primary"], default: true})
	}, {required: ["name", "collectionID"]}), [translations]);
	const uiSchema = React.useMemo(() => ({
		name: {
			"ui:help": translations["wizard.databank.form.name.help"]
		},
		primary: {
			"ui:options": {
				allowUndefined: false
			}
		}
	}), [translations]);

	const validators = React.useMemo(() => ({
		collectionID: {
			format: {
				pattern: /^HR\.\d+$/,
				message: translations["wizard.databank.form.collectionID.validator.format"]
			}
		}
	}), [translations]);

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
		<LajiForm schema={schema}
		          uiSchema={uiSchema}
		          ref={submitRef}
		          onSubmit={onLajiFormSubmit}
		          autoFocus={true}
		          validators={validators} >
			<Button onClick={onSubmit} variant="primary">{translations["save"]}</Button>
			<Button onClick={onSubmitDraft} variant="default">
				{translations["wizard.option.json.import.draft"]}
			</Button>
		</LajiForm>
	);
}

const formSelectNmscp = nmspc("form-select");

const useRangeIncrementor = (length: number)
	: [number | undefined, () => void, () => void]  => {
	const [idx, _setIdx] = React.useState<number | undefined>(length || undefined);
	const setIdx = React.useCallback((idx?: number) => {
		let nextIdx: number | undefined = idx;
		if (idx === undefined || idx < 0 || length === 0) {
			nextIdx = undefined;
		} else if (idx >= length) {
			nextIdx = length - 1;
		}
		_setIdx(nextIdx);
	}, [ _setIdx, length]);
	const increment = React.useCallback(() => setIdx((idx || 0) - 1), [idx, setIdx]);
	const decrement = React.useCallback(() => setIdx(idx === undefined ? 0 : idx + 1), [idx, setIdx]);
	return [idx === undefined ? idx : Math.min(idx, length - 1), increment, decrement];
};

function FormList({onSelected}: Pick<FormCreatorProps, "onSelected">) {
	const [forms, setForms] = React.useState<FormListing[] | undefined>(undefined);
	const {formService, notifier, translations, lang} = React.useContext(Context);
	const [loadingForms, setLoadingForms] = React.useState<Record<string, boolean>>({});

	const itemProps = React.useMemo(() => Object.keys(loadingForms).reduce((idToProps, id) => {
		if (loadingForms[id]) {
			idToProps[id] = { disabled: true };
		}
		return idToProps;
	}, {} as Record<string, ListGroupItemProps>), [loadingForms]);

	const loadForms = React.useCallback(async () => {
		setForms(await formService.getForms(lang));
	}, [formService, lang]);

	React.useEffect(() => {
		loadForms();
	}, [loadForms]);

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

	const searchFilterPredicate = React.useCallback(
		(search: string) => (f: FormListing) => (f.name + f.id).toLowerCase().match(search.toLowerCase()),
		[]
	);

	const _FormListItemContent = React.useCallback((props: Parameters<typeof FormListItemContent>[0]) => (
		<FormListItemContent {...props} onDelete={onDelete} />
	), [onDelete]);

	return <SearchList items={forms}
			             itemProps={itemProps}
			             onSelected={onSelected}
			             header={"wizard.list.header"}
			             searchFilterPredicate={searchFilterPredicate}
			             itemContentComponent={_FormListItemContent} />;
}

function FormListItemContent(
	{onSelected, onDelete, loading, active, ...f}
	: {
		onSelected: (form: FormListing) => void,
		onDelete: (id: string) => void,
		loading: boolean,
		active?: boolean
	} & FormListing
) {
	const {translations} = React.useContext(Context);
	const _onDelete = React.useCallback(async (e) => {
		e.stopPropagation();
		if (confirm(translateKey(translations, "wizard.list.delete.confirm", {name: f.name, id: f.id}))) {
			onDelete(f.id);
		}
	}, [f, onDelete, translations]);
	return <>
		{f.name} ({f.id})
		{loading
			? <Spinner />
			: <span onClick={_onDelete} className={formSelectNmscp("list-item-delete")} />
		}
	</>;
}

function SearchListItem<T extends { id: string }>(
	{item, onSelected, active, itemContentComponent, itemProps}
	: {
		item: T;
		onSelected: (id: string) => void;
		itemContentComponent: React.ComponentType<T>;
		itemProps?: ListGroupItemProps;
		active?: boolean;
	}
) {
	const {theme} = React.useContext(Context);
	const onClick = React.useCallback(() => {
		!itemProps?.disabled && onSelected(item.id);
	}, [item.id, itemProps?.disabled, onSelected]);
	const {ListGroupItem} = theme;
	const ItemContent = itemContentComponent;
	return (
		<ListGroupItem onClick={onClick}
		               className={formSelectNmscp("list-item")}
		               active={active}
		               {...(itemProps || {})}>
		 <ItemContent {...item} />
		</ListGroupItem>
	);
}

type SearchListProps<T extends { id: string }> = {
	items?: T[];
	onSelected: (item: string) => void;
	itemContentComponent: React.ComponentType<T>;
	itemProps: Record<string, ListGroupItemProps>;
	searchFilterPredicate: (filter: string) => (item: T) => unknown;
	header: string;
};

function SearchList<T extends { id: string }>(
	{items, onSelected, itemContentComponent, itemProps, header, searchFilterPredicate}: SearchListProps<T>
) {
	const {theme, translations} = React.useContext(Context);

	const [displayedItems, setDisplayedItems] = React.useState<T[] | undefined>(undefined);
	const [activeIdx, activeIdxUp, activeIdxDown] = useRangeIncrementor((displayedItems || []).length);

	const {Panel, ListGroup} = theme;

	const onKeyDown = React.useCallback((e) => {
		switch (e.key) {
		case "ArrowDown":
			activeIdxDown();
			e.preventDefault();
			break;
		case "ArrowUp":
			activeIdxUp();
			e.preventDefault();
			break;
		case "Enter":
			activeIdx !== undefined && displayedItems && onSelected(displayedItems[activeIdx].id);
			e.preventDefault();
			break;
		}
	}, [activeIdx, activeIdxDown, activeIdxUp, displayedItems, onSelected]);

	const list = !items
		? <Spinner />
		: (
			<ListGroup className={formSelectNmscp("list")}>
				{(displayedItems || []).map((item, idx) =>
					<SearchListItem key={item.id}
					              item={item}
					              itemContentComponent={itemContentComponent}
					              itemProps={itemProps?.[item.id]}
					              active={idx === activeIdx}
					              onSelected={onSelected} />
				)}
			</ListGroup>
		);

	const [searchValue, setSearchValue] = React.useState("");

	const filterItems = React.useCallback(() => {
		if (searchValue === "") {
			return setDisplayedItems(items);
		}
		if (!items) {
			return;
		}
		setDisplayedItems(items.filter(searchFilterPredicate(searchValue)));
	}, [items, searchFilterPredicate, searchValue]);

	React.useEffect(filterItems, [searchValue, items, filterItems]);

	return (
		<Panel>
			<Panel.Heading>
				<h4>{translations[header]}</h4>
				<SearchInput onChange={setSearchValue}
				             onKeyDown={onKeyDown}
				             autoFocus={true} />
			</Panel.Heading>
			{list}
		</Panel>
	);
}
