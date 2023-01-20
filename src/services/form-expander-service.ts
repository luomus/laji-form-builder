import { ExpandedMaster, Field, FormExtensionField, isFormExtensionField, JSONObject, Master } from "../model";
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
			this.mapBaseFormFromFields,
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

	private mapBaseFormFromFields = async <T extends Pick<Master, "fields" | "translations" | "uiSchema" | "context">>
	(master: T, signal?: AbortSignal) : Promise<Omit<T, "fields"> & { fields?: Field[]; }> => {
		if (!master.fields) {
			return master as (T & { fields?: Field[]; });
		}

		for (const idx in master.fields) {
			const f = master.fields[idx];
			if (!isFormExtensionField(f)) {
				continue;
			}
			const {formID} = f;
			master.fields.splice(+idx, 1);
			const {fields, uiSchema, translations, context} =
				await this.expandMaster(await this.storeService.getForm(formID, signal), signal);
			master.translations = merge(translations || {}, master.translations || {});
			master.uiSchema = merge(master.uiSchema || {}, uiSchema || {});
			if (!master.context && context) {
				master.context = context;
			}
			if (!fields) {
				continue;
			}
			master.fields = mergeFields(master.fields, fields);
		}
		return master as (T & { fields?: Field[]; });

		function mergeFields(fieldsFrom: (Field | FormExtensionField)[], fieldsTo: (Field | FormExtensionField)[])
			: (Field | FormExtensionField)[] {
			fieldsFrom.forEach(f => {
				if (isFormExtensionField(f)) {
					return;
				}
				const {name} = f;
				const exists = fieldsTo.find(f => !isFormExtensionField(f) && f.name === name) as Field;
				if (exists && f.fields && exists.fields) {
					mergeFields(f.fields, exists.fields);
				} else {
					fieldsTo.push(f);
				}
			});
			return fieldsTo;
		}
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
