import { ExpandedMaster, Field, isLang, FormOptions, Lang, Property } from "../../model";
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
		this.mapCommentToHelpText = this.mapCommentToHelpText.bind(this);
	}

	async expandUiSchema<T extends Pick<ExpandedMaster, "context" | "fields" | "uiSchema" | "options">>
	(master: T, rootField: Field, rootProperty: Property, lang?: Lang): Promise<T> {
		if (!master.fields) {
			return master;
		}
		const expandedUiSchema = await this.fieldToUiSchema(
			{...rootField, fields: master.fields},
			rootProperty,
			master.options,
			lang
		);
		return expandedUiSchema
			? {...master, uiSchema: merge(expandedUiSchema, master.uiSchema)}
			: master;
	}
	
	private async fieldToUiSchema
	(field: Field, property: Property, options?: FormOptions, lang?: Lang)
	: Promise<ExpandedMaster["uiSchema"] | undefined> {
		return reduceWith(undefined, property,
			this.mapEmbeddable(field, options, lang),
			mapMultilanguage,
			mapMaxOccurs,
			this.mapCommentToHelpText(options, lang)
		);
	}

	mapEmbeddable = (field: Field, options?: FormOptions, lang?: Lang) =>
		async (uiSchema: ExpandedMaster["uiSchema"] | undefined, property: Property) => {
			if (!property.isEmbeddable) {
				return uiSchema;
			}
			const {fields = []} = field;
			const properties = await this.metadataService.getProperties(fields, property);
			return fields.reduce<Promise<ExpandedMaster["uiSchema"] | undefined>>(async (uiSchemaPromise, f) => {
				const property = properties[f.name] || mapUnknownFieldWithTypeToProperty(f);
				let uiSchema = await uiSchemaPromise;
				const fieldUiSchema = await this.fieldToUiSchema(f, property, options, lang);
				if (fieldUiSchema && Object.keys(fieldUiSchema).length) {
					if (!uiSchema) {
						uiSchema = {};
					}
					uiSchema[f.name] = fieldUiSchema;
				}
				return uiSchema;
			}, Promise.resolve(undefined));
		}

	mapCommentToHelpText  = (options?: FormOptions, lang?: Lang) =>
		(uiSchema: ExpandedMaster["uiSchema"] | undefined, property: Property) => {
			if (options?.useSchemaCommentsAsHelpTexts && isLang(lang)) {
				const comment = property.comment?.[lang];
				if (comment) {
					return {...(uiSchema || {}), "ui:help": comment};
				}
			}
			return uiSchema;
		}
}

const mapMultilanguage = (uiSchema: ExpandedMaster["uiSchema"] | undefined, property: Property) =>
	property.multiLanguage
		? {...(uiSchema || {}), "ui:multiLanguage": true}
		: uiSchema;

const mapMaxOccurs = (uiSchema: ExpandedMaster["uiSchema"] | undefined, property: Property) =>
	uiSchema && property.maxOccurs === "unbounded"
		? {items: uiSchema}
		: uiSchema;
