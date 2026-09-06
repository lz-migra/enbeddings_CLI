import { GenericParser } from './generic-parser.js';
import { TreeSitterParser } from './tree-sitter-parser.js';

export class PythonParser extends TreeSitterParser {
  constructor() {
    super('python', ['function_definition', 'class_definition', 'decorated_definition'], new GenericParser());
  }
}
