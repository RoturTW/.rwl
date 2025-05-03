
(function(Scratch) {
    'use strict';

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
                if (text[i+1] == close)
                    tokens.push("");
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

    const removeStr = (str) => str.replace(/\\(.)|["'`]/g, (_match, escaped) => escaped === 'n' ? '\n' : escaped || '');
    const removeComments = (str) => str.replace(/(["'`])(?:(?=(\\?))\2.)*?\1|\/\/.*|\/\*[\s\S]*?\*\//g,((t,e)=>e?t:""))

    class AstSegment {
        constructor(code = null) {
            this.elements = [];
            this.parse(code ?? "");
        }
        parse(code) {
            this.elements = splitSegment(removeComments(code)).map(n => new AstNode(n));
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
            return `Node<${this.kind}>{${{
                block: () => `header:${this.data.header.stringify()},contents:${this.data.content.stringify()}`,
                element: () => `header:${this.data.header.stringify("element")},value:${this.data.value.stringify()}`,
            }[this.kind]() ?? this.data.toString().trim()}}`
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
            const value = new AstValue(header.key, null, code);
            this.kind = "element";
            this.data = {
                value: value,
                header: header
            };
            return;
        }
    }


    class AstHeader {
        constructor(code = "") {
            this.attributes = [];
            this.parse(code);
        }
        parse(code) {
            const header = splitHeader(code);

            this.key = header[0];
            if (header.length == 2) {
                this.attributes = splitSegment(header[1]).map(a => new AstAttribute(a));
            }
        }
        stringify(type="block") {
            if (type === "element")
                return `Header${this.attributes.length > 0 ? "{" + this.attributes.map(a => a.stringify()).join(",") + "}" : ""}`;
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
                this.value = new AstValue(tokens[1], null, code);
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
        constructor(code = "", value = null, code2 = null) {
            if (value) {
                this.type = code;
                this.value = value;
                return;
            }
            this.code = code2 ? code2 : code;
            this.parse(code.trim());
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
            
            const num = Number(code.replace("%",""));
            if (!isNaN(num)) {
                if (code[code.length-1] == "%") {
                    this.type = "percentage";
                    this.value = num;
                    return;
                } else {
                    this.type = "num";
                    this.value = num;
                    return;
                }
            }

            throw Error("Unknown value syntax: " + code);
        }
        stringify() {
            return `Value<${this.type}>${this.value ?? "" !== "" ? `{${{
                str: () => this.value,
                num: () => this.value.toString(),
                percentage: () => this.value.toString() + "%",
            }[this.type]()}}` : ""}`;
        }
        format() {
            return this.value.toString();
        }
        static toStr(v) {
            const type = v.type,
                value = v.value;
            return (
                type == "str" ? value :
                type == "num" ? value.toString() :
                "?"
            );
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

    class Frame {
        constructor(a,b) {
            this.a = Vec2.toVec(a) ?? Vec2.zero();
            this.b = Vec2.toVec(b) ?? Vec2.zero();
            this.update();
        }
        update() {
            this.size = this.getSize();
        }

        getCenter() {
            return new Vec2((this.a.x + this.b.x) * .5, (this.a.y + this.b.y) * .5);
        }
        getSize() {
            return new Vec2(this.b.x - this.a.x, this.b.y - this.a.y);
        }

        clone() {
            return new Frame(
                new Vec2(this.a.x, this.a.y),
                new Vec2(this.b.x, this.b.y)
            )
        }

        static zero() {
            return new Frame();
        }
    }
    class Vec2 {
        constructor(x,y) {
            this.x = x ?? 0;
            this.y = y ?? 0;
        }
        static toVec(v) {
            if (!v) return Vec2.zero();

            if (v instanceof Vec2)
                return v;
            if (Array.isArray(v))
                return new Vec2(v[0],v[1]);
            if (typeof v === "object")
                return new Vec2(v["x"],v["y"]);
            
            throw Error("cannot make " + typeof v + " a vec2: " + JSON.stringify(v));
        }
        static zero() {
            return new Vec2();
        }
    }

    class RWL {
        constructor (data) {
            if (typeof data !== "object" && Array.isArray(data)) data = {}
            this.ast = new Ast(data["code"] ?? "");
        }
        stringify() {
            return `RWL{ast:${this.ast.stringify()}}`;
        }
        getObject() {
            return JSON.parse(JSON.stringify(this));
        }
    }

    class RWLExt {
        getInfo() {
            return {
                id: 'rwlLanguage',
                name: 'RWL',
                color1: "#4d244f",
                blocks: [
                    {
                        opcode: 'ast',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'Generate AST from [code] and return as [type]',
                        arguments: {
                            code: { type: Scratch.ArgumentType.STRING, defaultValue: 'root { "hi" }' },
                            type: { type: Scratch.ArgumentType.STRING, menu: 'types', defaultValue: 'json'}
                        }
                    },
                ],
                menus: {
                    types: {
                        items: ['json', 'object'],
                        acceptReporters: true
                    }
                }
            };
        }

        ast({ code, type }) {
            const ast = new Ast(code);
            return type == "json" ? JSON.stringify(ast) : ast;
        }
    }

    Scratch.extensions.register(new RWLExt());
})(Scratch);