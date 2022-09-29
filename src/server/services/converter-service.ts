import { CommonFormat, ExpandedMaster, Field, Property } from "../../model";

export default abstract class ConverterService<T extends CommonFormat> {
	abstract convert(master: ExpandedMaster, rootField?: Field, rootProperty?: Property): Promise<T>;
}

