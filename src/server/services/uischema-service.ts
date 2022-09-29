import { ExpandedMaster, Field, Property } from "../../model";
import merge from "deepmerge";
import MetadataService from "../../services/metadata-service";

export default class UiSchemaService {
	metadataService: MetadataService;

	constructor(metadataService: MetadataService) {
		this.metadataService = metadataService;
		this.expandUiSchema = this.expandUiSchema.bind(this);
	}

	async expandUiSchema<T extends Pick<ExpandedMaster, "context" | "fields" | "uiSchema">>
	(master: T, rootField: Field, rootProperty: Property): Promise<T> {
		if (!master.fields) {
			return master;
		}
		const expandedUiSchema = await this.fieldToUiSchema(
			{...rootField, fields: master.fields},
			rootProperty
		);
		return expandedUiSchema
			? {...master, uiSchema: merge(expandedUiSchema, (master.uiSchema || {}))}
			: master;
	}

	private async fieldToUiSchema(field: Field, property: Property): Promise<Record<string, unknown> | undefined> {
		const {fields = []} = field;

		if (property.isEmbeddable) {
			const properties = await this.metadataService.getProperties(fields, property);
			return fields.reduce(async (uiSchemaPromise, f) => {
				const uiSchema = await uiSchemaPromise;
				const fieldUiSchema = await this.fieldToUiSchema(f, properties[f.name]);
				if (fieldUiSchema) {
					uiSchema[f.name] = fieldUiSchema;
				}
				return uiSchema;
			}, Promise.resolve({} as Record<string, unknown>));
		}

		if (property.multiLanguage) {
			return {"ui:multiLanguage": true};
		}
		return undefined;
	}
}
