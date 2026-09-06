import { GenericParser } from './generic-parser.js';
import { TreeSitterParser } from './tree-sitter-parser.js';

export class TypeScriptParser extends TreeSitterParser {
  constructor(language = 'typescript') {
    super(language, ['class_declaration', 'function_declaration', 'interface_declaration', 'enum_declaration', 'type_alias_declaration', 'method_definition', 'lexical_declaration', 'export_statement'], new GenericParser());
  }
}
