import { ExpandedMaster, Field, Property } from "../../model";
import merge from "deepmerge";
import MetadataService from "../../services/metadata-service";
import { mapUnknownFieldWithTypeToProperty } from "./field-service";
import { reduceWith } from "../../utils";

export default class UiSchemaService {
	metadataService: MetadataService;

	constructor(metadataService: MetadataService) {
		this.metadataService = metadataService;
		this.expandUiSchema = this.expandUiSchema.bind(this);
		this.mapEmbeddable = this.mapEmbeddable.bind(this);
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
			? {...master, uiSchema: merge(expandedUiSchema, master.uiSchema)}
			: master;
	}

	private async fieldToUiSchema(field: Field, property: Property): Promise<ExpandedMaster["uiSchema"] | undefined> {
		return reduceWith({}, property,
			this.mapEmbeddable(field),
			mapMultilanguage,
			mapMaxOccurs
		);
	}

	mapEmbeddable = (field: Field) => async (uiSchema: ExpandedMaster["uiSchema"] | undefined, property: Property) => {
		if (!property.isEmbeddable) {
			return uiSchema;
		}
		const {fields = []} = field;
		const properties = await this.metadataService.getProperties(fields, property);
		return fields.reduce<Promise<ExpandedMaster["uiSchema"] | undefined>>(async (uiSchemaPromise, f) => {
			const property = properties[f.name] || mapUnknownFieldWithTypeToProperty(f);
			let uiSchema = await uiSchemaPromise;
			const fieldUiSchema = await this.fieldToUiSchema(f, property);
			if (fieldUiSchema && Object.keys(fieldUiSchema).length) {
				if (!uiSchema) {
					uiSchema = {};
				}
				uiSchema[f.name] = fieldUiSchema;
			}
			return uiSchema;
		}, Promise.resolve(undefined));
	}
}

const mapMultilanguage = (uiSchema: ExpandedMaster["uiSchema"] | undefined, property: Property) =>
	property.multiLanguage
		? {...(uiSchema || {}), "ui:multiLanguage": true}
		: uiSchema;

const mapMaxOccurs = (uiSchema: ExpandedMaster["uiSchema"] | undefined, property: Property) =>
	property.maxOccurs === "unbounded"
		? {items: (uiSchema || {})}
		: uiSchema;
