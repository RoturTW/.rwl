
const blockCache = {};
const segmentCache = {};

function splitBlock(text) {
    let text2 = text.split("\n").filter(t => t !== "").join("\n");
    text = text.trim();
    const tokens = [];
    let current = "";

    let depth = 0;
    let hasSplit = false;
    let inSingle = false,
        inDouble = false,
        inTick = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char == "\\") {
            current += char;
            continue;
        }

        if (char == "'" && !(inDouble || inTick))
            inSingle = !inSingle;
        if (char == "\"" && !(inSingle || inTick))
            inDouble = !inDouble;
        if (char == "`" && !(inSingle || inDouble))
            inTick = !inTick;

        const inQuotes = inSingle || inDouble || inTick;

        if (inQuotes) {
            current += char;
            continue;
        }

        if (char === "{")
            depth ++;
        if (char === "}")
            depth --;

        if (char === "{" && depth == 1 && !hasSplit) {
            tokens.push(current.trim());
            current = "";
            continue;
        }
        if (char === "}" && depth == 0 && !hasSplit) {
            hasSplit = true;
            continue;
        }

        if (hasSplit) {
            throw Error("Unexpected text after block: \n" + text.substring(i).trim().split("\n").map(t => "    " + t).join("\n") + "\nin:\n" + text2.split("\n").map(t => "    " + t).join("\n") + "\n");
        }

        current += char;
    }

    if (current) {
        tokens.push(current.trim());
    }

    return tokens;
}

function splitHeader(text) {
    let text2 = text.split("\n").filter(t => t !== "").join("\n");
    text = text.trim();
    const tokens = [];
    let current = "";

    let depth = 0;
    let hasSplit = false;
    let inSingle = false,
        inDouble = false,
        inTick = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char == "\\") {
            current += char;
            continue;
        }

        if (char == "'" && !(inDouble || inTick))
            inSingle = !inSingle;
        if (char == "\"" && !(inSingle || inTick))
            inDouble = !inDouble;
        if (char == "`" && !(inSingle || inDouble))
            inTick = !inTick;

        const inQuotes = inSingle || inDouble || inTick;

        if (inQuotes) {
            current += char;
            continue;
        }

        if (char === "[")
            depth ++;
        if (char === "]")
            depth --;

        if (char === "[" && depth == 1) {
            tokens.push(current.trim());
            current = "";
            continue;
        }
        if (char === "]" && depth == 0 && !hasSplit) {
            hasSplit = true;
            if (current)
                tokens.push(current.trim());
            current = "";
            continue;
        }

        if (hasSplit) {
            throw Error("Unexpected text after header attributes: \n" + text.substring(i).trim().split("\n").map(t => "    " + t).join("\n") + "\nin:\n" + text2.split("\n").map(t => "    " + t).join("\n") + "\n");
        }

        current += char;
    }

    if (current) {
        tokens.push(current.trim());
    }

    return tokens;
}

function splitSegment(text) {
    text = text.trim();
    const tokens = [];
    let current = "";

    let depth = 0;
    let squareDepth = 0;
    let inSingle = false;
        inDouble = false;
        inTick = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char == "\\") {
            current += char;
            continue;
        }

        if (char == "'" && !(inDouble || inTick))
            inSingle = !inSingle;
        if (char == "\"" && !(inSingle || inTick))
            inDouble = !inDouble;
        if (char == "`" && !(inSingle || inDouble))
            inTick = !inTick;

        const inQuotes = inSingle || inDouble || inTick;

        if (inQuotes) {
            current += char;
            continue;
        }

        if (char === "{")
            depth ++;
        if (char === "}")
            depth --;

        if (char === "[")
            squareDepth ++;
        if (char === "]")
            squareDepth --;

        if (char === "," && depth == 0 && squareDepth == 0) {
            tokens.push(current);
            current = "";
            continue;
        }

        current += char;
    }

    if (current) {
        tokens.push(current);
    }

    return tokens;
}

function splitKey(text) {
    text = text.trim();
    const tokens = [];
    let current = "";

    let depth = 0;
    let inSingle = false;
        inDouble = false;
        inTick = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char == "\\") {
            current += char;
            continue;
        }

        if (char == "'" && !(inDouble || inTick))
            inSingle = !inSingle;
        if (char == "\"" && !(inSingle || inTick))
            inDouble = !inDouble;
        if (char == "`" && !(inSingle || inDouble))
            inTick = !inTick;

        const inQuotes = inSingle || inDouble || inTick;

        if (inQuotes) {
            current += char;
            continue;
        }

        if (char === "=" && depth == 0) {
            tokens.push(current);
            current = "";
            continue;
        }

        current += char;
    }

    if (current) {
        tokens.push(current);
    }

    return tokens;
}

const removeStr = (str) => str.replace(/\\(.)|["'`]/g, (match, escaped) => escaped || '');
const isNumeric = t=>/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t);

class AstSegment {
    constructor(code = null) {
        this.elements = [];
        if (code) {
            this.parse(code);
        }
    }
    parse(code) {
        const elements = splitSegment(code);
        this.elements = elements.map(n => new AstNode(n));
    }
    stringify() {
        return `Segment{${this.elements.map(n => n.stringify()).join(",")}}`
    }
}

class Ast extends AstSegment {}

class AstNode {
    constructor(code = null, data = null) {
        if (data) { // for stuff like new AstNode("block",{...});
            this.kind = code;
            this.data = data;
            return;
        }
        
        // parse the code and replace itself with it.
        let n = AstNode.parse(code) ?? AstNode.unknown(code);
        this.kind = n.kind;
        this.data = n.data;
    }
    stringify() {
        let contents = "";
        switch (this.kind) {
            case "block":
                contents = `header:${this.data.header.stringify()},contents:${this.data.content.stringify()}`
                break;
            case "unknown":
                contents = this.data.trim();
                break;
        }
        return `Node<${this.kind}>{${contents}}`
    }
    static unknown(code) {
        return new AstNode("unknown", code);
    }
    static parse(code) {
        if (code.trim() === "") return null;
        
        const block = splitBlock(code);
        if (block.length == 2) {
            const header = new AstBlockHeader(block[0]);
            const content = header.type === "script" ? new AstScriptSegment(block[1]) : new AstSegment(block[1]);
            return new AstNode("block",{
                "header": header,
                "content": content
            })
        }
    }
}

class AstBlockHeader {
    constructor(code = "") {
        this.parse(code);
    }
    parse(code) {
        const header = splitHeader(code);

        this.attributes = [];

        if (header.length == 2) {
            const attributes = splitSegment(header[1]);
            this.attributes = attributes.map(a => new AstBlockAttribute(a))
        }

        this.type = header[0];
    }
    stringify() {
        return `Header<${this.type}>${this.attributes.length > 0 ? "{" + this.attributes.map(a => a.stringify()).join(",") + "}" : ""}`;
    }
}

class AstBlockAttribute {
    constructor(code = "") {
        this.parse(code);
    }
    parse(code) {
        const tokens = splitKey(code);
        if (tokens.length == 2) {
            this.kind = "key";
            this.key = tokens[0];
            this.value = new AstValue(tokens[1]);
            return;
        }
        if (/^[A-Za-z0-9_]+$/.test(code)) {
            this.kind = "flag";
            this.data = code;
            return;
        }
        throw Error("Unknown attribute syntax: " + code);
    }
    stringify() {
        return `Attribute<${this.kind}>{${this.kind == "flag" ? this.data : this.kind == "key" ? this.key + "=" + this.value.stringify() : "?"}}`;
    }
}

class AstValue {
    constructor(code = "") {
        this.parse(code);
    }
    parse(code) {
        if (
            (code[0] === "\"" && code[code.length-1] === "\"") || 
            (code[0] === "'" && code[code.length-1] === "'") || 
            (code[0] === "`" && code[code.length-1] === "`")
        ) {
            this.type = "str";
            this.value = removeStr(code);
            return;
        }

        if (isNumeric(code)) {
            this.type = "num";
            this.value = Number(code);
            return;
        }

        throw Error("Unknown value syntax: " + code);
    }
    stringify() {
        return `Value<${this.type}>`;
    }
}

class AstScriptSegment {
    constructor(code = "") {
        this.data = code;
    }
    stringify() {
        return `Segment<Script>`;
    }
}

const code = `
root {
  "rwl based website :D" [id = "myID"],
  frame [flex] {
  
  },
  script [type="rtr",interval=5] {
    log("{")
  }
}
`

const ast = new Ast(code);
console.log(ast.stringify());
