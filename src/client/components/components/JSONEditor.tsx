import * as React from "react";
import { Context } from "src/client/components/Context";
import { Button, Classable, Stylable } from "src/client/components/components";
import { CSS_NAMESPACE, classNames, nmspc } from "src/client/utils";
import { JSON } from "src/model";

const getMinMaxed = (val: number, min?: number, max?: number) => {
	if (min) {
		val = Math.max(val, min);
	}
	if (max) {
		val = Math.min(val, max);
	}
	return val;
};

export type JSONEditorProps<T extends JSON | undefined> = {
	value?: T;
	onChange?: ((value?: T) => void) | React.Dispatch<React.SetStateAction<T | undefined>>;
	validator: (value?: JSON) => value is T;
	rows?: number;
	minRows?: number;
	maxRows?: number;
	resizable?: boolean;
	onValidChange?: (valid: boolean) => void;
	live?: boolean;
} & Classable & Stylable;

export const JSONEditor = React.forwardRef(function JSONEditor<T extends JSON | undefined>(
	{value, onChange, rows, minRows, maxRows, resizable = true, onValidChange, live, className, style = {}, validator}
	: JSONEditorProps<T>,
	ref: React.Ref<HTMLTextAreaElement>) {
	const stringValue = JSON.stringify(value, undefined, 2) ?? "";
	const [tmpValue, setTmpValue] = React.useState(stringValue);
	const [validValue, setValidValue] = React.useState(value);
	const [valid, setValid] = React.useState(true);
	const [touched, setTouched] = React.useState(false);

	React.useEffect(() => {
		if (tmpValue === "" || tmpValue === undefined) {
			const valid = validator(undefined);
			setValid(valid);
			valid && setValidValue(undefined);
			return;
		}
		try {
			const parsed = JSON.parse(tmpValue);
			const valid = validator(JSON.parse(tmpValue));
			valid && setValidValue(parsed);
			setValid(valid);
		} catch (e) {
			setValid(false);
		}
	}, [tmpValue, validator, setValid]);

	const tryOnChange = React.useCallback(() => {
		if (!valid) {
			return;
		}
		onChange?.(validValue);
	}, [valid, validValue, onChange]);

	React.useEffect(() => setTmpValue(stringValue), [stringValue]);
	React.useEffect(() => {
		touched && live && tryOnChange();
	}, [touched, live, validValue, tryOnChange]);

	React.useEffect(() => onValidChange?.(valid), [valid, onValidChange]);

	const onTextareChange = React.useCallback((e: any) => {
		setTouched(true);
		setTmpValue(e.target.value);
	}, []);

	const onBlur = React.useCallback(() => {
		if (!touched) {
			return;
		}
		tryOnChange();
	}, [touched, tryOnChange]);

	const _rows = getMinMaxed(
		rows === undefined
			? (tmpValue ?? "").split("\n").length
			: rows,
		minRows,
		maxRows
	);

	const editorNmspc = nmspc("json-editor");

	return (
		<textarea
			className={classNames("form-control", editorNmspc(), !valid && editorNmspc("invalid"), className)}
			onBlur={onBlur}
			rows={_rows}
			style={{...style, width: "100%", resize: resizable ? "vertical" : "none"}}
			onChange={onTextareChange}
			value={tmpValue}
			ref={ref}
		/>
	);
});

export type SubmittableJSONEditorProps<T extends JSON | undefined> =
	Pick<JSONEditorProps<T>, "value" | "validator" | "onChange">
	& {
	onSubmit: (value: T) => void;
	onSubmitDraft?: (value: T) => void;
	submitLabel?: string;
} & Classable;

export function SubmittableJSONEditor<T extends JSON>(
	{value, onSubmit, validator, onSubmitDraft, onChange, className, submitLabel}: SubmittableJSONEditorProps<T>
) {
	const {translations} = React.useContext(Context);
	const [json, _setJSON] = React.useState(value);
	const setJSON = React.useCallback((json) => {
		onChange?.(json);
		_setJSON(json);
	}, [onChange, _setJSON]);

	const [valid, setValid] = React.useState(false);
	const onClickSubmit = React.useCallback(() => onSubmit(json as unknown as T), [json, onSubmit]);
	const onClickSubmitDraft = React.useCallback(() => onSubmitDraft?.(json as unknown as T), [json, onSubmitDraft]);

	// Focus on mount.
	const ref = React.useRef<HTMLTextAreaElement>(null);
	React.useEffect(() => ref.current?.focus(), []);

	return (
		<div className={className}>
			<JSONEditor value={json} 
			            validator={validator}
			            onChange={setJSON}
			            onValidChange={setValid}
			            live={true}
			            ref={ref}
			            style={{height: "80vh"}} />
			<Button onClick={onClickSubmit}
			        variant="primary"
			        disabled={json === undefined || !valid}
			>{submitLabel || "OK"}
			</Button>
			{onSubmitDraft && (
				<Button onClick={onClickSubmitDraft}
			          disabled={json === undefined || !valid}
			          variant={"default"}
			          className={`${className ? className + "-" : CSS_NAMESPACE}preview-btn`}
				>{translations["wizard.option.json.import.draft"]}
				</Button>
			)}
		</div>
	);
}

const bypassValidator = (v: JSON): v is JSON => true;

export const AnyJSONEditor = (props: Omit<JSONEditorProps<JSON>, "validator">) =>
	<JSONEditor {...props} validator={bypassValidator} />;

