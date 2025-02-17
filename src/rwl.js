
const blockCache = {};
const segmentCache = {};

function split(text, type, name) {
    let text2 = text.split("\n").filter(t => t !== "").join("\n");
    text = text.trim();
    const tokens = [];
    let current = "";

    let curlyDepth = 0,
        squareDepth = 0;
    let hasSplit = false;
    let inSingle = false,
        inDouble = false,
        inTick = false;
    
    const brackets = {"curly":["{","}"],"square":["[","]"]}[type] ?? ["",""]; // get the bracket pairs
    const open = brackets[0],
        close = brackets[1];
    const splitChar = type.length === 1 ? type : "";
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char == "\\") { current += char; continue; }

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
            curlyDepth ++;
        if (char === "}")
            curlyDepth --;
        if (char === "[")
            squareDepth ++;
        if (char === "]")
            squareDepth --;
        
        if (char === open && curlyDepth == (type == "curly" ? 1 : 0) && squareDepth == (type == "square" ? 1 : 0) && !hasSplit) {
            tokens.push(current.trim());
            current = "";
            continue;
        }
        if (char === close && curlyDepth == 0 && squareDepth == 0 && !hasSplit) {
            hasSplit = true;
            continue;
        }

        if (char === splitChar && curlyDepth == 0 && squareDepth == 0) {
            tokens.push(current);
            current = "";
            continue;
        }

        if (hasSplit) {
            throw Error(`Unexpected text after ${name}: \n` + text.substring(i).trim().split("\n").map(t => "    " + t).join("\n") + "\nin:\n" + text2.split("\n").map(t => "    " + t).join("\n") + "\n");
        }

        current += char;
    }

    if (current) {
        tokens.push(current.trim());
    }

    return tokens;
}

const splitBlock = (text) => split(text, "curly", "block");
const splitHeader = (text) => split(text, "square", "header");
const splitSegment = (text) => split(text, ",");
const splitKey = (text) => split(text, "=");

const removeStr = (str) => str.replace(/\\(.)|["'`]/g, (match, escaped) => escaped || '');
const removeComments = (str) => str.replace(/(["'`])(?:(?=(\\?))\2.)*?\1|\/\/.*|\/\*[\s\S]*?\*\//g,((t,e)=>e?t:""))

class AstSegment {
    constructor(code = null) {
        this.elements = [];
        if (code) {
            this.parse(code);
        }
    }
    parse(code) {
        const elements = splitSegment(removeComments(code));
        this.elements = elements.map(n => new AstNode(n));
    }
    stringify() {
        return `Segment{${this.elements.map(n => n.stringify()).join(",")}}`
    }
}

class Ast extends AstSegment {
    stringify() {
        return `Ast{${this.elements.map(n => n.stringify()).join(",")}}`
    }
}

class AstNode {
    constructor(code = null, data = null) {
        this.kind = "unknown";
        this.data = code;

        this.parse(code);
    }
    stringify() {
        let contents = "";
        switch (this.kind) {
            case "block":
                contents = `header:${this.data.header.stringify()},contents:${this.data.content.stringify()}`;
                break;
            case "element":
                contents = `value:${this.data.value.stringify()},attributes:[${this.data.attributes.map(a => a.stringify()).join(",")}]`;
                break;
            case "unknown":
                contents = this.data.trim();
                break;
        }
        return `Node<${this.kind}>{${contents}}`
    }
    parse(code) {
        if (code.trim() === "") {
            this.kind = "empty";
            this.data = {};
            return;
        }
        
        const block = splitBlock(code);
        const header = new AstHeader(block[0]);
        if (block.length == 2) {
            const content = header.key === "script" ? new AstScriptSegment(block[1]) : new AstSegment(block[1]);
            this.kind = "block";
            this.data = {
                header: header,
                content: content
            };
            return;
        }
        const value = new AstValue(header.key);
        this.kind = "element";
        this.data = {
            value: value,
            attributes: header.attributes
        };
        return;
    }
}

class AstHeader {
    constructor(code = "") {
        this.parse(code);
    }
    parse(code) {
        const header = splitHeader(code);

        this.attributes = [];

        if (header.length == 2) {
            const attributes = splitSegment(header[1]);
            this.attributes = attributes.map(a => new AstAttribute(a))
        }

        this.key = header[0];
    }
    stringify() {
        return `Header<${this.key}>${this.attributes.length > 0 ? "{" + this.attributes.map(a => a.stringify()).join(",") + "}" : ""}`;
    }
}

class AstAttribute {
    constructor(code = "") {
        this.parse(code);
    }
    parse(code) {
        const tokens = splitKey(code);

        if (tokens.length == 2) {
            this.kind = "key";
            this.key = tokens[0].trim();
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
        code = code.trim();
        
        if (
            (code[0] === "\"" && code[code.length-1] === "\"") || 
            (code[0] === "'" && code[code.length-1] === "'") || 
            (code[0] === "`" && code[code.length-1] === "`")
        ) {
            this.type = "str";
            this.value = removeStr(code);
            return;
        }
        
        const num = Number(code);
        if (!isNaN(num)) {
            this.type = "num";
            this.value = num;
            return;
        }

        if (code[code.length-1] == "%") {
            const num = Number(code.slice(0,-1));
            if (!isNaN(num)) {
                this.type = "percentage";
                this.value = num;
                return;
            }
        }

        throw Error("Unknown value syntax: " + code);
    }
    stringify() {
        let data = null;
        switch (this.type) {
            case "str":
                data = this.value;
                break;
            case "num":
                data = this.value.toString();
                break;
            case "percentage":
                data = this.value.toString() + "%";
                break;
        }
        return `Value<${this.type}>${data ?? "" !== "" ? `{${data}}` : ""}`;
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
    frame [direction = "horizontal"] {
        section [scale = 100] {
            ":3"
        },
        section [scale = 50%] {
            "wow"
        },
        section {
            "crazy"
        }
    },
    script [type="rtr",interval=5] {
        log("hi")
    }
}
`

const ast = new Ast(code);
console.log(ast.stringify());
