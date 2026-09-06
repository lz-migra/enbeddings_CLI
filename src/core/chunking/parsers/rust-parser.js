import { GenericParser } from './generic-parser.js';
import { TreeSitterParser } from './tree-sitter-parser.js';

export class RustParser extends TreeSitterParser {
  constructor() {
    super('rust', ['function_item', 'struct_item', 'enum_item', 'trait_item', 'impl_item', 'mod_item'], new GenericParser());
  }
}