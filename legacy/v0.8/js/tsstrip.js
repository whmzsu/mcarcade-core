/*
 * tsstrip.js —— 把 pxt (MakeCode) 生成的 TypeScript 削成可直接被 QuickJS / V8 执行的 JS。
 *
 * 目标不是实现一个完整的 TS 编译器，而是覆盖 pxt 代码生成器实际产出的语法子集：
 *   - enum X { A, B = 3 }                -> var + 反向映射对象
 *   - namespace X { export const ... }   -> X.foo = ...
 *   - 接口 / 类型别名 / declare / import  -> 丢弃
 *   - 类型标注 (a: number, let x: Sprite, ): void
 *   - 泛型实参 Array<Sprite>、as 断言、非空断言 x!、可选参数 a?
 *   - img`...` 模板字面量原样保留（运行时提供 img 标签函数）
 *
 * 只做词法级改写，不做语义分析。改不动的语法会原样留下，由宿主报出编译错误。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TsStrip = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEYWORDS_BEFORE_TYPE = { "let": 1, "const": 1, "var": 1 };
  var STOP_TYPE_PARAM = { ",": 1, ")": 1, ";": 1, "=": 1, "{": 1, "}": 1 };
  var STOP_TYPE_DECL = { "=": 1, ";": 1, ",": 1, ")": 1, "}": 1 };
  var ACCESS_MODS = { "private": 1, "public": 1, "protected": 1, "readonly": 1 };

  // ---------- 词法 ----------
  function tokenize(src) {
    var toks = [];
    var i = 0, n = src.length;
    while (i < n) {
      var c = src[i];
      if (c === " " || c === "\t" || c === "\r" || c === "\n") {
        var j = i + 1;
        while (j < n && /[ \t\r\n]/.test(src[j])) j++;
        toks.push({ t: "ws", v: src.slice(i, j) });
        i = j;
      } else if (c === "/" && src[i + 1] === "/") {
        var j2 = src.indexOf("\n", i);
        if (j2 < 0) j2 = n;
        toks.push({ t: "cmt", v: src.slice(i, j2) });
        i = j2;
      } else if (c === "/" && src[i + 1] === "*") {
        var j3 = src.indexOf("*/", i + 2);
        j3 = j3 < 0 ? n : j3 + 2;
        toks.push({ t: "cmt", v: src.slice(i, j3) });
        i = j3;
      } else if (c === '"' || c === "'") {
        var j4 = i + 1;
        while (j4 < n) {
          if (src[j4] === "\\") j4 += 2;
          else if (src[j4] === c) { j4++; break; }
          else j4++;
        }
        toks.push({ t: "str", v: src.slice(i, j4) });
        i = j4;
      } else if (c === "`") {
        var j5 = i + 1, depth = 0;
        while (j5 < n) {
          if (src[j5] === "\\") { j5 += 2; continue; }
          if (src[j5] === "$" && src[j5 + 1] === "{") { depth++; j5 += 2; continue; }
          if (src[j5] === "}" && depth > 0) { depth--; j5++; continue; }
          if (src[j5] === "`" && depth === 0) { j5++; break; }
          j5++;
        }
        toks.push({ t: "tpl", v: src.slice(i, j5) });
        i = j5;
      } else if (/[A-Za-z_$\u00a0-\uffff]/.test(c)) {
        var j6 = i + 1;
        while (j6 < n && /[A-Za-z0-9_$\u00a0-\uffff]/.test(src[j6])) j6++;
        toks.push({ t: "id", v: src.slice(i, j6) });
        i = j6;
      } else if (/[0-9]/.test(c)) {
        var j7 = i + 1;
        while (j7 < n && /[0-9a-fA-FxXoObBeE._]/.test(src[j7])) j7++;
        toks.push({ t: "num", v: src.slice(i, j7) });
        i = j7;
      } else if (src.substr(i, 3) === "===" || src.substr(i, 3) === "!==" ||
                 src.substr(i, 3) === "**=" || src.substr(i, 3) === "..." ||
                 src.substr(i, 3) === ">>>" || src.substr(i, 3) === "&&=" ||
                 src.substr(i, 3) === "||=" || src.substr(i, 3) === "??=") {
        toks.push({ t: "p", v: src.substr(i, 3) });
        i += 3;
      } else if (/^(=>|==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|%=|<<|>>|\?\?|\?\.)/.test(src.substr(i, 2))) {
        toks.push({ t: "p", v: src.substr(i, 2) });
        i += 2;
      } else {
        toks.push({ t: "p", v: c });
        i += 1;
      }
    }
    return toks;
  }

  function isCode(t) { return t && t.t !== "ws" && t.t !== "cmt"; }

  function prevCode(toks, i) {
    for (var k = i - 1; k >= 0; k--) if (isCode(toks[k])) return toks[k];
    return null;
  }
  function nextCode(toks, i) {
    for (var k = i + 1; k < toks.length; k++) if (isCode(toks[k])) return toks[k];
    return null;
  }
  function nextCodeIdx(toks, i) {
    for (var k = i + 1; k < toks.length; k++) if (isCode(toks[k])) return k;
    return -1;
  }

  // ---------- 预处理：enum / namespace / interface / type / import ----------

  function expandEnums(src) {
    return src.replace(/\benum\s+([A-Za-z_$][\w$]*)\s*\{([^}]*)\}/g, function (m, name, body) {
      var items = body.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      var lines = [];
      var auto = 0;
      items.forEach(function (it) {
        var eq = it.indexOf("=");
        var key, val;
        if (eq >= 0) {
          key = it.slice(0, eq).trim();
          val = it.slice(eq + 1).trim();
        } else {
          key = it;
          val = String(auto);
        }
        auto = 0; // 只在纯自增时才连续，带初值后从该值续号由下面修正
        lines.push(name + "[" + JSON.stringify(key) + "] = " + val + "; " + name + "[" + val + "] = " + JSON.stringify(key) + ";");
      });
      // 修正自增序号
      var seq = 0;
      lines = items.map(function (it) {
        var eq = it.indexOf("=");
        if (eq >= 0) { var v = it.slice(eq + 1).trim(); seq = parseInt(v, 10) || 0; }
        var k = (eq >= 0 ? it.slice(0, eq) : it).trim();
        var out = name + "[" + JSON.stringify(k) + "] = " + seq + "; " + name + "[" + seq + "] = " + JSON.stringify(k) + ";";
        seq++;
        return out;
      });
      return "var " + name + "; (function (" + name + ") { " + lines.join(" ") + " })(" + name + " || (" + name + " = {}));";
    });
  }

  /*
   * 逐行统计花括号净增量，跳过字符串 / 模板 / 注释（含跨行状态）。
   * namespace 的结束 `}` 和"if/else/for 块的结束 `}`"长得一模一样，
   * 只靠行内容区分不了，必须靠深度。
   */
  function makeBraceScanner() {
    var state = { mode: null };          // null | "block" | "tpl" | "squote" | "dquote"
    var fn = function (line) {
      var d = 0, i = 0, n = line.length;
      while (i < n) {
        var c = line[i];
        if (state.mode === "block") {
          if (c === "*" && line[i + 1] === "/") { state.mode = null; i += 2; continue; }
          i++; continue;
        }
        if (state.mode === "tpl") {
          if (c === "\\") { i += 2; continue; }
          if (c === "`") { state.mode = null; i++; continue; }
          i++; continue;
        }
        if (state.mode === "squote" || state.mode === "dquote") {
          var q = state.mode === "squote" ? "'" : "\"";
          if (c === "\\") { i += 2; continue; }
          if (c === q) { state.mode = null; i++; continue; }
          i++; continue;
        }
        if (c === "/" && line[i + 1] === "/") break;
        if (c === "/" && line[i + 1] === "*") { state.mode = "block"; i += 2; continue; }
        if (c === "'") { state.mode = "squote"; i++; continue; }
        if (c === "\"") { state.mode = "dquote"; i++; continue; }
        if (c === "`") { state.mode = "tpl"; i++; continue; }
        if (c === "{") { d++; i++; continue; }
        if (c === "}") { d--; i++; continue; }
        i++;
      }
      return d;
    };
    fn.state = state;                    // 外部据此判断当前是否还在字符串/模板里
    return fn;
  }

  function expandNamespaces(src) {
    var out = [];
    var stack = [];                       // { ns, base }：base = 进入 namespace 前的花括号深度
    var nsNames = [];
    var scan = makeBraceScanner();
    var depth = 0;
    var lines = src.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m = scan.state.mode === null && /^(\s*)namespace\s+([A-Za-z_$][\w$.]*)\s*\{\s*$/.exec(line);
      var delta = scan(line);
      if (m) {
        var ns = m[2];
        stack.push({ ns: ns, base: depth });
        nsNames.push(ns);
        out.push(m[1] + "/* namespace " + ns + " */");
        depth += delta;
        continue;
      }
      // 只有"整行就是一个 }"、且深度正好回到 namespace 进入前的位置，才是 namespace 结束。
      // 之前只看 /\}\s*$/，会把 namespace 里 if/else 的闭括号一并吃掉，产出语法不完整的 JS。
      if (stack.length && /^\s*\}\s*$/.test(line) && depth + delta === stack[stack.length - 1].base) {
        stack.pop();
        depth += delta;
        continue;
      }
      depth += delta;
      if (stack.length) {
        var ns2 = stack[stack.length - 1].ns;
        var e = /^(\s*)export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)\s*/.exec(line);
        if (e) {
          var rest = line.slice(e[0].length).replace(/;\s*$/, "");
          if (rest.charAt(0) === "=") out.push(e[1] + ns2 + "." + e[3] + " " + rest + ";");
          else out.push(e[1] + ns2 + "." + e[3] + " = undefined;");
          continue;
        }
        var f = /^(\s*)export\s+function\s+([A-Za-z_$][\w$]*)\s*/.exec(line);
        if (f) {
          var tail = line.slice(f[0].length).replace(/;$/, "");
          out.push(f[1] + ns2 + "." + f[2] + " = function " + f[2] + tail +
            (/\{\s*$/.test(tail) ? "" : ";"));
          continue;
        }
        var c = /^(\s*)export\s+class\s+([A-Za-z_$][\w$]*)\s*/.exec(line);
        if (c) {
          out.push(c[1] + "class " + c[2] + " " + line.slice(c[0].length).trim());
          out.push(c[1] + ns2 + "." + c[2] + " = " + c[2] + ";");
          continue;
        }
      }
      out.push(line);
    }
    /*
     * namespace 的空对象初始化统一提到文件最前面。
     * pxt 导出的工程里经常在 namespace 定义之前就写 `gamejam.register("x", _x.main)`，
     * 按原来的位置执行会拿到 undefined / 被兜底成空，提前建好对象才不至于一上来就崩。
     */
    if (nsNames.length) {
      var head = nsNames.map(function (n) {
        return n + " = (typeof " + n + " !== \"undefined\" && " + n + ") || {};";
      }).join("\n");
      out.unshift(head);
    }
    return out.join("\n");
  }

  function dropTypeOnlyStatements(src) {
    // interface / type alias / declare / import / export-import
    src = src.replace(/^\s*(?:export\s+)?interface\s+[A-Za-z_$][\w$]*[^{]*\{[\s\S]*?^\s*\}\s*$/gm, "");
    src = src.replace(/^\s*(?:export\s+)?type\s+[A-Za-z_$][\w$]*[^=]*=[\s\S]*?;\s*$/gm, "");
    src = src.replace(/^\s*(?:export\s+)?declare\s+[^\n]*$/gm, "");
    src = src.replace(/^\s*import\s+[^\n]*$/gm, "");
    src = src.replace(/^\s*export\s*\{\s*[^}]*\}\s*;?\s*$/gm, "");
    return src;
  }

  // ---------- 类型标注剔除 ----------

  function stripTypes(src) {
    var toks = tokenize(src);
    var out = [];
    var parens = [];        // { isParams, brace }：每层 '(' 是否参数表 + 它所在的花括号深度
    var braceDepth = 0;     // 仅用于 class body 判定
    var classDepth = -1;    // class 体所在的 braceDepth

    function skipType(from, stops) {
      var k = from, depth = 0;
      while (k < toks.length) {
        var t = toks[k];
        if (!isCode(t)) { k++; continue; }
        var v = t.v;
        if (v === "<" || v === "(" || v === "[" || v === "{") depth++;
        else if (v === ">" || v === ")" || v === "]" || v === "}") {
          if (depth === 0) return k;
          depth--;
        } else if (depth === 0 && stops[v]) return k;
        else if (depth === 0 && v === "=>") { k++; continue; }
        k++;
      }
      return k;
    }

    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (!isCode(t)) { out.push(t); continue; }
      var v = t.v, p = prevCode(toks, i), nx = nextCode(toks, i);

      if (t.t === "p") {
        if (v === "{") braceDepth++;
        else if (v === "}") {
          if (braceDepth === classDepth) classDepth = -1;
          braceDepth--;
        } else if (v === "(") {
          var isParams = false;
          if (p) {
            if (p.t === "id") {
              // function / catch 后面的括号就是参数表，里面的 `a: T` 必须剥掉。
              // 之前把 function 也归进"不是参数表"，于是 `function (sprite: Sprite)`
              // 里的类型标注原样漏到 JS，直接是语法错误。
              if (p.v === "function" || p.v === "catch") isParams = true;
              else if (p.v === "if" || p.v === "for" || p.v === "while" ||
                       p.v === "switch" || p.v === "return" || p.v === "typeof") isParams = false;
              else isParams = true;
            }
            else if (p.v === ")") isParams = true;
            else if (p.v === "]") isParams = false;
          }
          // 箭头函数形参表：'(a: T, b: U) =>' 前面可能是 ',' '(' '=' 等，靠右括号后面是不是 '=>' 判断
          if (!isParams && isArrowParamList(toks, i)) isParams = true;
          parens.push({ isParams: isParams, brace: braceDepth });
        } else if (v === ")") {
          parens.pop();
        }
      }

      if (v === "class") {
        // 找 class 体起始的 {，记下深度
        var k2 = i;
        while (k2 < toks.length && !(toks[k2].t === "p" && toks[k2].v === "{")) k2++;
        classDepth = braceDepth + 1;
      }

      if (v === "<" && t.t === "p") {
        // 泛型参数列表：紧跟在标识符后、且同层能配平的 <...> 之后是 '(' —— 保守跳过
        if (p && (p.t === "id") && nx && nx.t === "id") {
          var j = i, depth2 = 0, ok = false;
          for (; j < toks.length; j++) {
            if (!isCode(toks[j])) continue;
            if (toks[j].v === "<") depth2++;
            else if (toks[j].v === ">") { depth2--; if (depth2 === 0) { ok = true; break; } }
            else if (toks[j].v === ";" || toks[j].v === "{" || toks[j].v === ")") break;
          }
          if (ok && j - i <= 12) { i = j; continue; }
        }
      }

      if (v === "as" && t.t === "id") {
        i = skipType(i + 1, { ",": 1, ")": 1, ";": 1, "]": 1, "}": 1, "&&": 1, "||": 1, ".": 1, ":": 1 }) - 1;
        continue;
      }

      if (v === "!" && t.t === "p" && nx && (nx.v === "." || nx.v === ")" || nx.v === "," || nx.v === ";")) {
        continue; // 非空断言
      }

      if (v === "?" && t.t === "p" && nx && nx.v === ":") continue; // 可选参数/字段

      if (t.t === "id" && ACCESS_MODS[v]) {
        if (nx && nx.t === "id") continue;
      }

      if (v === ":" && t.t === "p") {
        var ptop = parens.length ? parens[parens.length - 1] : null;
        // 只在参数表自己的层级有效：进了回调的 { } 之后，里面的
        // `default:` / `{a: 1}` 都不再是类型标注，不能剥。
        var inParams = !!(ptop && ptop.isParams && ptop.brace === braceDepth);
        var isVarDecl = p && p.t === "id" && v === ":" && prevCode(toks, i - 1) &&
          (function () {
            var pp = prevCode(toks, i);
            if (!pp || pp.t !== "id") return false;
            var p3 = prevCode(toks, i - 1);
            return true;
          })();
        var afterVar = false;
        if (p && p.t === "id") {
          // let/const/var name : Type
          var back = i - 1;
          var ids = [];
          while (back >= 0 && ids.length < 3) {
            if (isCode(toks[back])) ids.push(toks[back]);
            back--;
          }
          if (ids.length >= 2 && ids[1].t === "id" && KEYWORDS_BEFORE_TYPE[ids[1].v]) afterVar = true;
        }
        var afterReturn = p && p.v === ")" && (parensClosedBefore(toks, i) || isArrowReturnType(toks, i));
        var inClassBody = classDepth >= 0 && braceDepth === classDepth;
        if ((inParams && p && (p.t === "id" || p.v === "?" || p.v === "]")) || afterVar || afterReturn || inClassBody) {
          var stops = inParams ? STOP_TYPE_PARAM : STOP_TYPE_DECL;
          i = skipType(i + 1, stops) - 1;
          continue;
        }
      }

      out.push(t);
    }
    return out.map(function (t) { return t.v; }).join("");
  }

  // 判断 i 处的 '(' 是否是箭头函数的形参表（右括号后面接 '=>' 或 ': Type =>'）
  function isArrowParamList(toks, i) {
    var depth = 0;
    for (var k = i; k < toks.length; k++) {
      if (!isCode(toks[k])) continue;
      var v = toks[k].v;
      if (v === "(") depth++;
      else if (v === ")") {
        depth--;
        if (depth === 0) {
          var n = nextCode(toks, k);
          if (!n) return false;
          if (n.v === "=>") return true;
          if (n.v === ":") {
            // 返回类型：跳过直到 '=>'
            var m = skipTypeTokens(toks, k + 1);
            return !!(m < toks.length && toks[m] && toks[m].v === "=>");
          }
          return false;
        }
      } else if (depth === 1 && (v === ";" || v === "{")) {
        return false;
      }
    }
    return false;
  }

  // 从 from 起跳过一段类型标注，返回停在的 token 下标
  function skipTypeTokens(toks, from) {
    var k = from, depth = 0, steps = 0;
    while (k < toks.length) {
      var t = toks[k];
      if (!isCode(t)) { k++; continue; }
      if (++steps > 256) return k;
      var v = t.v;
      if (v === "<" || v === "(" || v === "[" || v === "{") depth++;
      else if (v === ">" || v === ")" || v === "]" || v === "}") {
        if (depth === 0) return k;
        depth--;
      } else if (depth === 0 && (v === "=>" || v === ";" || v === "=" || v === "," || v === "{" || v === "}")) {
        return k;
      }
      k++;
    }
    return k;
  }

  // i 处是 ':'，判断它后面跟着的是不是箭头函数的返回类型（即类型之后是 '=>'）
  function isArrowReturnType(toks, i) {
    var m = skipTypeTokens(toks, i + 1);
    return !!(m < toks.length && toks[m] && toks[m].v === "=>");
  }

  // 判断 i 处的 ")" 是否对应一个参数表
  function parensClosedBefore(toks, i) {
    var depth = 0;
    for (var k = i; k >= 0; k--) {
      if (!isCode(toks[k])) continue;
      if (toks[k].v === ")") depth++;
      else if (toks[k].v === "(") {
        depth--;
        if (depth === 0) {
          var p = prevCode(toks, k);
          return !!(p && (p.t === "id" || p.v === ")"));
        }
      }
    }
    return false;
  }

  function format(src) {
    // 压缩掉被删语句留下的连续空行
    return src.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n");
  }

  function tsToJs(src) {
    var s = src.replace(/\r\n/g, "\n");
    s = dropTypeOnlyStatements(s);
    s = expandEnums(s);
    s = expandNamespaces(s);
    s = stripTypes(s);
    s = format(s);
    return s;
  }

  return { tsToJs: tsToJs, tokenize: tokenize };
});
