import { CompleteTranslations, ExpandedField, ExpandedJSONFormat, ExpandedMaster, Field, Lang, LANGS, Property,
	PropertyRange } from "../../model";
import MetadataService from "../../services/metadata-service";
import { dictionarify, reduceWith } from "../../utils";
import { mapUnknownFieldWithTypeToProperty } from "./field-service";
import ConverterService from "./converter-service";

export default class ExpandedJSONService extends ConverterService<ExpandedJSONFormat> {
	metadataService: MetadataService;
	lang: Lang;

	constructor(metadataService: MetadataService, lang: Lang) {
		super(metadataService);
		this.metadataService = metadataService;
		this.lang = lang;
		this.expandChildren = this.expandChildren.bind(this);
		this.mapRange = this.mapRange.bind(this);
	}

	setLang(lang: Lang) {
		this.lang = lang;
	}

	async convert(master: ExpandedMaster, rootField?: Field, rootProperty?: Property) {
		if (!rootField || !rootProperty) {
			return master as ExpandedJSONFormat;
		}
		// The translations will be mutably modified to have the alt labels.
		const translations = ["fi", "sv", "en"].reduce<CompleteTranslations>((translations, lang: Lang) =>
			({
				...translations,
				[lang]: JSON.parse(JSON.stringify(master.translations?.[lang] || {}))}
			), {} as CompleteTranslations
		);
		const expanded = await this.expandField(
			{...rootField, fields: master.fields},
			rootProperty,
			translations
		);
		return {
			...master,
			fields: expanded.fields,
			translations
		};
	}

	/**
	 * Returns the expanded fields and mutates the translations to have the alt labels.
	 */
	async expandField(field: Field, property: Property, translations: CompleteTranslations)
	: Promise<ExpandedField> {
		return reduceWith(field, property, 
			this.expandChildren(translations),
			this.mapRange(translations),
			mapEmbeddable,
			mapMaxOccurs,
			filterWhitelist,
			filterBlacklist,
			addLabel(translations)
		);
	}

	expandChildren = (translations: CompleteTranslations) => async (field: Field, property: Property) => {
		if (!property.isEmbeddable || !field.fields) {
			return field;
		}
		const properties = await this.getProperties(field.fields, property);
		return {...field, fields: await Promise.all(
			field.fields.map(field => {
				let prop = properties[field.name];
				if (!prop) {
					prop = mapUnknownFieldWithTypeToProperty(field);
				}
				return this.expandField(field, prop, translations);
			})
		)};
	}

	mapRange = (translations: CompleteTranslations) => async (field: Field, property: Property)
	: Promise<Omit<Field, "type"> & Pick<ExpandedField, "type">> => {
		const range = property.range[0];
		if (await this.metadataService.isAltRange(range)) {
			if (field.type === "hidden") {
				return field;
			}
			return this.mapAltRange(field, property, translations);
		}

		switch (range) {
		case PropertyRange.String:
			return {...field, type: "text"};
		case PropertyRange.Boolean:
			return {...field, type: "checkbox"};
		case PropertyRange.Int:
			return {...field, type: "integer"};
		case PropertyRange.NonNegativeInteger:
			return {...field, type: "integer:nonNegativeInteger"};
		case PropertyRange.PositiveInteger:
			return {...field, type: "integer:positiveInteger"};
		case PropertyRange.Decimal:
			return {...field, type: "number"};
		case PropertyRange.DateTime:
			return {...field, type: "text"};
		case PropertyRange.keyValue:
		case PropertyRange.keyAny:
			return {...field, type: "fieldset"};
		default:
			if (!property.isEmbeddable) {
				return {...field, type: "text"};
			} else {
				return field;
			}
		}
	}

	async mapAltRange(field: Field, property: Property, translations: CompleteTranslations)
	: Promise<Omit<Field, "type"> & Pick<ExpandedField, "type">> {
		const range = await this.metadataService.getRange(property.range[0]);
		return {
			...field,
			type: "select",
			options: {
				...(field.options || {}),
				value_options: field.options?.value_options || range.reduce<Record<string, string>>((collected, r) => {
					LANGS.forEach(lang => {
						const translation = r.value?.[lang];
						if (typeof translation === "string") {
							translations[lang][`@${r.id}`] = translation;
						}
					});
					return {
						...collected,
						[r.id]: `@${r.id}`
					};
				}, property.minOccurs === "1" ? {} : {"": ""})
			}
		};
	}
}

const mapEmbeddable = (field: ExpandedField, property: Property) => 
	property.isEmbeddable
		? {...field, type: "fieldset"}
		: field;

const mapMaxOccurs = (field: ExpandedField, property: Property) => 
	property.maxOccurs === "unbounded"
		? {
			...field,
			type: "collection",
			options: {
				...(field.options || {}),  target_element: {
					...(field.options?.target_element || {}), type: field.type
				}
			}
		}
		: field;

const filterList = (listName: "whitelist" | "blacklist", white = true) => (field: ExpandedField) => {
	if (!field.options?.value_options) {
		return field;
	}

	const list = field.options[listName];
	if (!list) {
		return field;
	}

	const dict = dictionarify(list);
	const _check = (w: string) => !dict[w];
	const check = white ? _check : (w: string) => !_check(w);

	const {value_options} = field.options;
	const options = {...field.options};
	delete options[listName];

	return {
		...field,
		options: {
			...options,
			value_options: Object.keys(value_options).reduce<Record<string, string>>((filtered, key) => {
				if (!check(key)) {
					filtered[key] = value_options[key] as string;
				}
				return filtered;
			}, {})
		}
	};
};

const filterWhitelist = filterList("whitelist");
const filterBlacklist = filterList("blacklist", false);

const addLabel = (translations: CompleteTranslations) => (field: ExpandedField, property: Property) => {
	if (!("label" in field)) {
		const labelKey = `@${field.name}`;
		LANGS.forEach(lang => {
			translations[lang][labelKey] = property.label[lang] || "";
		});
		return {...field, label: labelKey};
	}
	return field;
};
