import { ExpandedMaster, JSONObject, Master } from "../model";
import { reduceWith } from "../utils";
import merge from "deepmerge";
import { applyPatch } from "fast-json-patch";

type HasGetForm = {getForm: (id: string, abort?: AbortSignal) => Promise<Master>};

export default class FormExpanderService {
	private storeService: HasGetForm;

	constructor(storeService: HasGetForm) {
		this.storeService = storeService;
	}

	linkMaster(master: Master, signal?: AbortSignal) {
		return reduceWith(
			JSON.parse(JSON.stringify(master)) as Master,
			signal,
			this.mapBaseForm,
			this.mapFieldsFormID,
		);
	}

	private mapBaseForm = async <T extends Pick<Master, "baseFormID" | "translations" | "uiSchema">>
	(master: T, signal?: AbortSignal): Promise<Omit<T, "baseFormID">> => {
		if (!master.baseFormID) {
			return master;
		}
		const baseForm = await this.mapBaseForm(await this.storeService.getForm(master.baseFormID, signal), signal);
		return this.mapBaseFormFrom(master, baseForm);
	}

	private mapBaseFormFrom<T extends Pick<Master, "baseFormID" | "translations" | "uiSchema">>
	(form: T, baseForm: Master) : Omit<T, "baseFormID"> {
		const {id, ..._baseForm} = baseForm;
		form = {
			..._baseForm,
			...form,
			translations: merge(_baseForm.translations || {}, form.translations || {}),
			uiSchema: merge(_baseForm.uiSchema || {}, form.uiSchema || {})
		};
		delete form.baseFormID;
		return form;
	}

	mapFieldsFormID =
	async <T extends Pick<Master, "fields" | "translations" | "uiSchema" | "context" | "fieldsFormID">>
	(master: T) : Promise<Omit<T, "fieldsFormID">> => {
		if (!master.fieldsFormID) {
			return master;
		}
		const {fieldsFormID, ...masterWithoutFieldsFormID} = master;

		const {fields, uiSchema, translations, context} =
			await this.expandMaster(await this.storeService.getForm(fieldsFormID));
		const _master: Omit<T, "fieldsFormID"> = {
			...masterWithoutFieldsFormID,
			fields,
			translations: merge(translations || {}, master.translations || {}),
			uiSchema: merge(master.uiSchema || {}, uiSchema || {}),
		};
		if (!master.context && context) {
			_master.context = context;
		}
		return _master;
	}


	async expandMaster(master: Master, signal?: AbortSignal): Promise<ExpandedMaster> {
		return reduceWith(await this.linkMaster(master, signal), undefined,
			this.applyPatches,
			addEmptyUiSchema
		);
	}

	private applyPatches<T extends Pick<Master, "patch">>(master: T): Omit<T, "patch"> {
		const {patch, ..._master} = master;
		return patch
			? (applyPatch(_master, patch, undefined, false).newDocument as T)
			: master;
	}
}

const addEmptyUiSchema = <T extends Partial<Master>>(master: T): T & { uiSchema: JSONObject } =>
	master.uiSchema
		? master as T & { uiSchema: JSONObject }
		: {...master, uiSchema: {}};
