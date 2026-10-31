// Benchmark-only copy of the previous NT4 schema parser.
// Source: fabac4afec9f4642340255929a594a3bdb743c6e:packages/client/src/lib/struct/struct-parser.ts
// Keep its parsing logic unchanged so the baseline remains reproducible.

/** Single punctuation or keyword token. */
const PUNCT = /^[[\]{}:;,=]/;
/** Identifier: letter or _ then alphanumeric or _. */
const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*/;
/** Integer: optional minus then digits. */
const INT = /^-?\d+/;
/** Whitespace. */
const WS = /^[\s\r\n\t]+/;

export type ParsedField = {
  typeName: string;
  name: string;
  arraySize: number;
  bitWidth: number;
  enumValues?: Record<string, number>;
};

class Lexer {
  private input: string;
  private pos = 0;

  constructor(input: string) {
    this.input = input;
  }

  eof(): boolean {
    this.skipWhitespace();
    return this.pos >= this.input.length;
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length) {
      const m = this.input.slice(this.pos).match(WS);
      if (m) {
        this.pos += m[0].length;
      } else {
        break;
      }
    }
  }

  /** Returns next token as string, or null if eof. */
  next(): string | null {
    this.skipWhitespace();
    if (this.pos >= this.input.length) return null;
    const rest = this.input.slice(this.pos);
    const p = rest.match(PUNCT);
    if (p) {
      this.pos += p[0].length;
      return p[0];
    }
    const i = rest.match(INT);
    if (i) {
      this.pos += i[0].length;
      return i[0];
    }
    const id = rest.match(IDENT);
    if (id) {
      this.pos += id[0].length;
      return id[0];
    }
    throw new Error(`Struct schema lexer: unexpected character at position ${this.pos}`);
  }

  /** Peek next token without consuming. */
  peek(): string | null {
    const saved = this.pos;
    const t = this.next();
    this.pos = saved;
    return t;
  }
}

/**
 * Parses a WPILib struct schema string into a list of field declarations.
 * @param schema - Schema string (e.g. "double x;double y" or "Translation2d translation;Rotation2d rotation").
 * @returns Array of parsed fields.
 * @throws Error on malformed schema.
 */
export function parseSchema(schema: string): ParsedField[] {
  const lex = new Lexer(schema);
  const fields: ParsedField[] = [];

  while (!lex.eof()) {
    let enumValues: Record<string, number> | undefined;

    const first = lex.next();
    if (!first) break;

    if (first === 'enum') {
      const open = lex.next();
      if (open !== '{') throw new Error('Struct schema: expected "{" after enum');
      enumValues = parseEnumEntries(lex);
      const close = lex.next();
      if (close !== '}') throw new Error('Struct schema: expected "}" after enum entries');
    } else if (first === '{') {
      enumValues = parseEnumEntries(lex);
      const close = lex.next();
      if (close !== '}') throw new Error('Struct schema: expected "}" after enum entries');
    }

    const typeName = first === 'enum' || first === '{' ? lex.next() : first;
    if (!typeName || PUNCT.test(typeName) || INT.test(typeName)) {
      throw new Error('Struct schema: expected type after declaration start');
    }

    const name = lex.next();
    if (!name || PUNCT.test(name) || INT.test(name)) {
      throw new Error('Struct schema: expected identifier after type');
    }

    let arraySize = 1;
    let bitWidth = 0;

    const afterName = lex.peek();
    if (afterName === '[') {
      lex.next();
      const sizeTok = lex.next();
      if (!sizeTok || !INT.test(sizeTok)) throw new Error('Struct schema: expected integer in array size');
      const n = parseInt(sizeTok, 10);
      if (n <= 0) throw new Error('Struct schema: array size must be positive');
      arraySize = n;
      const close = lex.next();
      if (close !== ']') throw new Error('Struct schema: expected "]" after array size');
    } else if (afterName === ':') {
      lex.next();
      const widthTok = lex.next();
      if (!widthTok || !INT.test(widthTok)) throw new Error('Struct schema: expected integer in bitfield width');
      bitWidth = parseInt(widthTok, 10);
      if (bitWidth <= 0) throw new Error('Struct schema: bitfield width must be positive');
    }

    fields.push({ typeName, name, arraySize, bitWidth, enumValues });

    while (lex.peek() === ';') {
      lex.next();
    }
  }

  return fields;
}

function parseEnumEntries(lex: Lexer): Record<string, number> {
  const enumValues: Record<string, number> = {};
  for (;;) {
    if (lex.peek() === '}') break;
    const id = lex.next();
    if (!id) break;
    if (PUNCT.test(id) || INT.test(id)) throw new Error('Struct schema: expected identifier in enum entry');
    const eq = lex.next();
    if (eq !== '=') throw new Error('Struct schema: expected "=" in enum entry');
    const num = lex.next();
    if (!num || !INT.test(num)) throw new Error('Struct schema: expected integer in enum value');
    enumValues[id] = parseInt(num, 10);
    const next = lex.peek();
    if (next === ',') {
      lex.next();
    } else if (next === '}') {
      break;
    } else if (next !== null) {
      throw new Error(`Struct schema: unexpected token "${next}" in enum`);
    }
  }
  return enumValues;
}
