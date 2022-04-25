import { CommonFormat, ExpandedMaster, Field, PropertyModel } from "../../model";
import MetadataService from "../../services/metadata-service";
import { unprefixProp } from "../../utils";
import { InternalProperty } from "./field-service";

export default abstract class ConverterService<T extends CommonFormat> {
	metadataService: MetadataService;

	constructor(metadataService: MetadataService) {
		this.metadataService = metadataService;
	}

	abstract convert(master: ExpandedMaster, rootField: Field, rootProperty: InternalProperty): Promise<T>;

	async getProperties(fields: Field[], property: PropertyModel) {
		return fields
			? (await this.metadataService.getProperties(property.range[0]))
				.reduce<Record<string, InternalProperty>>((propMap, prop) => {
					if (fields.some(f => unprefixProp(prop.property) === unprefixProp(f.name))) {
						propMap[unprefixProp(prop.property)] = prop;
					}
					return propMap;
				}, {})
			: {};
	}
}

