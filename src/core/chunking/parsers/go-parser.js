import { GenericParser } from './generic-parser.js';
import { TreeSitterParser } from './tree-sitter-parser.js';

export class GoParser extends TreeSitterParser {
  constructor() {
    super('go', ['function_declaration', 'method_declaration', 'type_declaration'], new GenericParser());
  }
}