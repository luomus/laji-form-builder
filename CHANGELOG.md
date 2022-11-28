## 1.0.0
### BREAKING CHANGES:
* `schema` format follows strictly now the JSON Schema 7 spec. As a result, the support for the `enum` & `enumNames` keywords were dropped. Enumerations are formatted as items of `oneOf` instead. To use the old format, use the `schema-with-enums` format` (which will be deprecated later on though)
