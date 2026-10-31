/*
 * arcade.js —— 在 JS 里重新实现 MakeCode Arcade 的运行时/API。
 *
 * 设计要点：
 *   1. 不做硬件模拟。卡的 PNG 里是工程源码，转译后直接在 JS 引擎里跑，游戏看到的 API 由这里提供。
 *   2. 屏幕 160x120、16 色调色板，和真机一致；渲染纯 JS（最终一帧交给宿主转成 RGBA）。
 *   3. 只用 ES2018 级别的语法，方便在 QuickJS 里跑。
 *
 * 坐标系：x 向右，y 向下，屏幕 160x120；精灵 x/y 是中心点，速度单位是 像素/秒。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    // Node 下单独 require：把转译器当依赖注入（打包进 C 核心时它是全局变量）
    module.exports = factory(require("./tsstrip.js"));
  } else {
    root.Arcade = factory(root.TsStrip);
  }
})(typeof self !== "undefined" ? self : this, function (TsStripDep) {
  "use strict";
  var TsStrip = TsStripDep ||
    (typeof globalThis !== "undefined" ? globalThis.TsStrip : null) ||
    (typeof TsStrip !== "undefined" ? TsStrip : null);

  var SW = 160, SH = 120;

  // MakeCode Arcade 的 16 色调色板（0 号是透明）
  var PALETTE = [
    [0, 0, 0], [255, 255, 255], [255, 33, 33], [255, 147, 196],
    [255, 129, 53], [255, 246, 9], [36, 156, 163], [120, 220, 82],
    [0, 63, 173], [135, 242, 255], [142, 46, 196], [164, 131, 159],
    [92, 64, 108], [229, 205, 196], [145, 70, 61], [0, 0, 0]
  ];

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // ---------------- Image ----------------

  function Image(w, h, data) {
    this.width = w;
    this.height = h;
    this.data = data || new Uint8Array(w * h); // 调色板下标
  }

  Image.prototype.setPixel = function (x, y, c) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data[y * this.width + x] = c & 0x0f;
  };
  Image.prototype.getPixel = function (x, y) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.data[y * this.width + x];
  };
  Image.prototype.fill = function (c) {
    this.data.fill(c & 0x0f);
  };
  Image.prototype.fillRect = function (x, y, w, h, c) {
    for (var j = 0; j < h; j++)
      for (var i = 0; i < w; i++) this.setPixel(x + i, y + j, c);
  };
  Image.prototype.drawRect = function (x, y, w, h, c) {
    for (var i = 0; i < w; i++) { this.setPixel(x + i, y, c); this.setPixel(x + i, y + h - 1, c); }
    for (var j = 0; j < h; j++) { this.setPixel(x, y + j, c); this.setPixel(x + w - 1, y + j, c); }
  };
  Image.prototype.drawLine = function (x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
    for (;;) {
      this.setPixel(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  };
  Image.prototype.blit = function (src, dx, dy) {
    for (var y = 0; y < src.height; y++) {
      for (var x = 0; x < src.width; x++) {
        var c = src.data[y * src.width + x];
        if (c) this.setPixel(dx + x, dy + y, c);
      }
    }
  };
  Image.prototype.clone = function () {
    return new Image(this.width, this.height, new Uint8Array(this.data));
  };
  Image.prototype.transposed = function () {
    var out = new Image(this.height, this.width);
    for (var y = 0; y < this.height; y++)
      for (var x = 0; x < this.width; x++) out.setPixel(y, x, this.getPixel(x, y));
    return out;
  };
  Image.prototype.flipX = function () {
    var out = new Image(this.width, this.height);
    for (var y = 0; y < this.height; y++)
      for (var x = 0; x < this.width; x++) out.setPixel(this.width - 1 - x, y, this.getPixel(x, y));
    return out;
  };
  Image.prototype.flipY = function () {
    var out = new Image(this.width, this.height);
    for (var y = 0; y < this.height; y++)
      for (var x = 0; x < this.width; x++) out.setPixel(x, this.height - 1 - y, this.getPixel(x, y));
    return out;
  };
  Image.prototype.drawImage = function (src, x, y) { this.blit(src, x, y); };
  /* 缩放：pxt 的 doubled / halved / scaled 都是最近邻，索引直接复制 */
  Image.prototype.scaled = function (sx, sy) {
    sx = Math.max(1, sx | 0); sy = Math.max(1, (sy === undefined ? sx : sy | 0));
    var out = new Image(this.width * sx, this.height * sy);
    for (var y = 0; y < out.height; y++) {
      var sy0 = (y / sy) | 0;
      for (var x = 0; x < out.width; x++) {
        out.data[y * out.width + x] = this.data[sy0 * this.width + ((x / sx) | 0)];
      }
    }
    return out;
  };
  Image.prototype.doubled = function () { return this.scaled(2, 2); };
  Image.prototype.halved = function () {
    var out = new Image(Math.max(1, this.width >> 1), Math.max(1, this.height >> 1));
    for (var y = 0; y < out.height; y++)
      for (var x = 0; x < out.width; x++)
        out.data[y * out.width + x] = this.data[(y * 2) * this.width + x * 2];
    return out;
  };
  Image.prototype.print = function () { return this; };
  Image.ofBuffer = function (buf) { return imageFromBuffer(buf, 16, 16); };

  // img`...` —— 点阵文本转图片
  function imageFromText(strings) {
    var text = strings && strings.raw ? strings.raw[0] : String(strings);
    var rows = text.split("\n").map(function (r) { return r.trim(); }).filter(function (r) { return r.length > 0; });
    var w = 0;
    var parsed = rows.map(function (r) {
      var cells = r.split(/\s+/);
      if (cells.length > w) w = cells.length;
      return cells;
    });
    var img = new Image(w, parsed.length);
    for (var y = 0; y < parsed.length; y++) {
      for (var x = 0; x < parsed[y].length; x++) {
        var ch = parsed[y][x];
        var c = ch === "." ? 0 : parseInt(ch, 16);
        if (isNaN(c)) c = 0;
        img.setPixel(x, y, c);
      }
    }
    return img;
  }

  // ---------------- 文字（3x5 小字库，仅用于分数/提示） ----------------

  var GLYPHS = {
    "0": "111101101101111", "1": "010110010010111", "2": "111001111100111",
    "3": "111001111001111", "4": "101101111001001", "5": "111100111001111",
    "6": "111100111101111", "7": "111001001001001", "8": "111101111101111",
    "9": "111101111001111", "A": "111101111101101", "B": "110101110101110",
    "C": "111100100100111", "D": "110101101101110", "E": "111100111100111",
    "F": "111100111100100", "G": "111100101101111", "H": "101101111101101",
    "I": "111010010010111", "J": "001001001101111", "K": "101101110101101",
    "L": "100100100100111", "M": "101111111101101", "N": "110101101101101",
    "O": "111101101101111", "P": "111101111100100", "Q": "111101101111001",
    "R": "111101111110101", "S": "111100111001111", "T": "111010010010010",
    "U": "101101101101111", "V": "101101101101010", "W": "101101111111101",
    "X": "101101010101101", "Y": "101101010010010", "Z": "111001010100111",
    " ": "000000000000000", ":": "000010000010000", "-": "000000111000000",
    ".": "000000000000010", "!": "010010010000010", "/": "001001010100100"
  };

  function drawText(img, str, x, y, color) {
    str = String(str).toUpperCase();
    var cx = x;
    for (var i = 0; i < str.length; i++) {
      var g = GLYPHS[str[i]];
      if (g) {
        for (var k = 0; k < 15; k++) {
          if (g[k] === "1") img.setPixel(cx + (k % 3), y + ((k / 3) | 0), color);
        }
      }
      cx += 4;
    }
  }

  // ---------------- Sprite ----------------

  var SpriteFlag = {
    Ghost: 1, AutoDestroy: 2, StayInScreen: 4, RelativeToCamera: 8,
    Invisible: 16, ShowBehindAll: 32
  };

  var spriteIdSeq = 0;

  function Sprite(image, kind) {
    this._id = ++spriteIdSeq;
    this._img = image || new Image(1, 1);
    this._x = 0; this._y = 0;
    this.vx = 0; this.vy = 0;
    this.ax = 0; this.ay = 0;
    this.kind = kind;
    this.flags = 0;
    this.z = 0;
    this.lifespan = 0;
    this._age = 0;
    this._alive = true;
    this._anims = {};
    this._curAnim = null;
    this._animStart = 0;
    this.destroyed = false;
    this.data = {};
    this._fx = [];
  }

  Sprite.prototype._w = function () { return this._img.width; };
  Sprite.prototype._h = function () { return this._img.height; };

  Object.defineProperty(Sprite.prototype, "x", {
    get: function () { return this._x; },
    set: function (v) { this._x = v; }
  });
  Object.defineProperty(Sprite.prototype, "y", {
    get: function () { return this._y; },
    set: function (v) { this._y = v; }
  });
  Object.defineProperty(Sprite.prototype, "left", {
    get: function () { return Math.round(this._x - this._img.width / 2); },
    set: function (v) { this._x = v + this._img.width / 2; }
  });
  Object.defineProperty(Sprite.prototype, "right", {
    get: function () { return Math.round(this._x + this._img.width / 2); },
    set: function (v) { this._x = v - this._img.width / 2; }
  });
  Object.defineProperty(Sprite.prototype, "top", {
    get: function () { return Math.round(this._y - this._img.height / 2); },
    set: function (v) { this._y = v + this._img.height / 2; }
  });
  Object.defineProperty(Sprite.prototype, "bottom", {
    get: function () { return Math.round(this._y + this._img.height / 2); },
    set: function (v) { this._y = v - this._img.height / 2; }
  });
  Object.defineProperty(Sprite.prototype, "width", { get: function () { return this._img.width; } });
  Object.defineProperty(Sprite.prototype, "height", { get: function () { return this._img.height; } });
  Object.defineProperty(Sprite.prototype, "image", {
    get: function () { return this._img; },
    set: function (v) { if (v) this._img = v; }
  });

  Sprite.prototype.setImage = function (img) { if (img) this._img = img; return this; };
  Sprite.prototype.setPosition = function (x, y) { this._x = x; this._y = y; return this; };
  Sprite.prototype.setVelocity = function (vx, vy) { this.vx = vx; this.vy = vy; return this; };
  Sprite.prototype.setFlag = function (f, on) {
    if (on) this.flags |= f; else this.flags &= ~f;
    return this;
  };
  Sprite.prototype.setBounceOnWall = function (v) { this._bounce = !!v; return this; };
  Sprite.prototype.setStayInScreen = function (v) { this.setFlag(SpriteFlag.StayInScreen, v); return this; };
  Sprite.prototype.setScale = function () { return this; };
  /* 命中方向探测：pxt 里 Sprite.isHittingTile(CollisionDirection.X) 是"贴着这类格子吗"，
     游戏会拿它判断落地 / 顶头 / 撞墙，所以必须实时探，不能用上一帧的缓存。 */
  Sprite.prototype.isHittingTile = function (dir) {
    var probe = 1.2;
    if (dir === CollisionDirection.Left || dir === 1) return spriteHitsTile(this, this._x - probe, this._y);
    if (dir === CollisionDirection.Right || dir === 2) return spriteHitsTile(this, this._x + probe, this._y);
    if (dir === CollisionDirection.Top || dir === 3) return spriteHitsTile(this, this._x, this._y - probe);
    if (dir === CollisionDirection.Bottom || dir === 4) return spriteHitsTile(this, this._x, this._y + probe);
    return false;
  };
  Sprite.prototype.onHitWall = function (cb) {
    (this._onHitWall || (this._onHitWall = [])).push(cb);
    return this;
  };
  Sprite.prototype.isHittingWall = function () {
    return this.isHittingTile(1) || this.isHittingTile(2);
  };
  Sprite.prototype.destroy = function (e) {
    if (!this._alive) return;
    this._alive = false;
    this.destroyed = true;
    if (e && typeof e === "object") e._sprite = this;
    fireList(this._onDestroyed, [this]);
    fireList(this._onCreated && null, []);
    return this;
  };
  Sprite.prototype.onDestroyed = function (cb) {
    (this._onDestroyed || (this._onDestroyed = [])).push(cb);
    return this;
  };
  Sprite.prototype.say = function (text) {
    this._say = { text: String(text), until: nowMs() + 1500 };
    return this;
  };
  Sprite.prototype.startEffect = function (fx, duration) {
    var name = fxName(fx);
    Graphics.spawnSpriteEffect(this, name, duration);
    return this;
  };
  Sprite.prototype.overlapsWith = function (other) {
    return Graphics.overlap(this, other);
  };
  Sprite.prototype.setAction = function (name) { this._curAnim = name; this._animStart = nowMs(); return this; };
  Sprite.prototype.setKind = function (k) { this.kind = k; return this; };

  // ---------------- 事件表 ----------------

  function fireList(list, args) {
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      try { list[i].apply(null, args || []); }
      catch (e) { Host.warn("handler error: " + (e && e.message ? e.message : e)); }
    }
  }

  // ---------------- 全局状态 ----------------

  var Host = {
    log: function () { },
    warn: function (m) { if (Host.log) Host.log("warn", m); },
    present: function () { },
    now: function () { return Date.now(); }
  };
  function nowMs() { return Host.now(); }

  var g = {
    sprites: [],
    nextZ: 1,
    bgColor: 0,
    updateHandlers: [],
    paintHandlers: [],
    intervalHandlers: [],   // {ms, last, cb}
    overlapHandlers: [],    // {k1,k2,cb}
    started: false,
    gameOver: false,
    score: 0,
    life: 0,
    buttonsDown: {},
    buttonHandlers: [],     // {btn, ev, cb}
    movers: [],             // controller.moveSprite 注册的 {sprite, vx, vy, pc}
    volume: 20,             // music.volume()，0..255（pxt 默认 20），0 = 静音
    showStats: false,       // 菜单 SHOW STATS
    showConsole: false,     // 菜单 SHOW CONSOLE
    logLines: [],           // console.log 的环形记录，给 CONSOLE 覆盖层用
    fps: 60,                // 名义 60fps，半秒后换成实测值
    _frames: 0,
    _fpsAt: 0,
    sysMenu: { open: false, index: 0, active: false },   // MENU 键弹出的系统菜单
    overlapCooldown: {},    // "handler:spriteA:spriteB" -> 冷却到期时刻
    btnRepeat: {},          // 按住键的重复计时
    repeatDelay: 500,
    repeatInterval: 100,
    shadeHandlers: [],
    textLayer: [],
    clock: 0,
    tilemap: null,          // 当前 tiles.setTilemap 设的图块地图
    ccTiles: {},            // color-coded-tilemap：像素索引 -> { img, wall }
    tempo: 120,             // music 的 BPM
    melody: null,           // 正在播的旋律 { notes, idx, loopsLeft, beatMs, nextAt }
    ccMap: null,            // color-coded-tilemap：最近一次 setTileMap 传进来的"地图画"
    tileOverlapHandlers: [],// scene.onOverlapTile 注册的 {kind, tile, cb}
    wallHandlers: [],       // scene.onHitWall 注册的 {kind, cb}
    factories: {},          // 生成代码 helpers._registerFactory 注册的取资源函数
    cam: { x: 0, y: 0, follow: null, shakeUntil: 0, shakeAmp: 0, sx: 0, sy: 0 }
  };

  var KindCounter = 1;
  var SpriteKind = {
    Player: 1,
    Projectile: 2,
    Food: 3,
    Enemy: 4,
    Asteroid: 5,
    Shell: 6,
    Effect: 7,
    create: function () { return ++KindCounter + 7; }
  };

  // ---------------- 渲染 ----------------

  var Graphics = {
    screen: new Image(SW, SH),
    particles: [],

    clear: function (color) {
      this.screen.data.fill(color & 0x0f);
    },

    overlap: function (a, b) {
      if (!a._alive || !b._alive) return false;
      return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    },

    drawSprite: function (s) {
      if (!s._alive || (s.flags & SpriteFlag.Invisible)) return;
      var img = s._img;
      var cx = camX(), cy = camY();
      var ox = Math.round(s._x - img.width / 2) - cx;
      var oy = Math.round(s._y - img.height / 2) - cy;
      var sc = this.screen;
      for (var y = 0; y < img.height; y++) {
        var py = oy + y;
        if (py < 0 || py >= SH) continue;
        for (var x = 0; x < img.width; x++) {
          var px = ox + x;
          if (px < 0 || px >= SW) continue;
          var c = img.data[y * img.width + x];
          if (c === 0) continue;
          sc.data[py * SW + px] = c;
        }
      }
      if (s._say && s._say.until > nowMs()) {
        var txt = s._say.text;
        var w = txt.length * 4 + 4;
        for (var yy = -1; yy < 6; yy++)
          for (var xx = -1; xx < w; xx++) {
            var bx = ox + xx, by = oy - 10 + yy;
            if (bx >= 0 && bx < SW && by >= 0 && by < SH && (yy === -1 || yy === 5 || xx === -1 || xx === w - 1))
              sc.data[by * SW + bx] = 1;
          }
        drawText(sc, txt, ox + 1, oy - 9, 15);
      }
    },

    spawnSpriteEffect: function (s, name, duration) {
      var n = name === "rings" ? 10 : 6;
      for (var i = 0; i < n; i++) {
        var a = (Math.PI * 2 * i) / n;
        this.particles.push({
          x: s._x, y: s._y,
          vx: Math.cos(a) * 60, vy: Math.sin(a) * 60,
          life: (duration || 500) / 1000, age: 0,
          color: (i % 13) + 3
        });
      }
    },

    screenEffect: null,
    startScreenEffect: function (name) {
      // 只给认识的几个名字生成粒子。pxt 的屏幕特效有一大堆（clouds / blizzard /
      // melt…），没收录的名词如果瞎给粒子，画面会糊成一片彩点。
      var known = {
        blizzard: 1, blizzard2: 1, confetti: 1, sparkles: 1, bubbles: 1, stars: 1,
        smoke: 1, fountain: 1, hearts: 1, flames: 1, ash: 1, melt: 1,
        trails: 1, warmRadial: 1, coolRadial: 1, disintegrate: 1
      };
      this.screenEffect = { name: name, parts: [], quiet: !known[name] };
    },
    updateEffects: function (dt) {
      // 精灵特效粒子
      for (var i = this.particles.length - 1; i >= 0; i--) {
        var p = this.particles[i];
        p.age += dt;
        if (p.age > p.life) { this.particles.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      var se = this.screenEffect;
      if (!se || se.quiet) return;
      var count = se.name === "blizzard" ? 6 : 3;
      for (var k = 0; k < count; k++) {
        if (se.name === "blizzard")
          se.parts.push({ x: Math.random() * SW, y: -2, vx: -10 - Math.random() * 10, vy: 25 + Math.random() * 20, c: 1 });
        else
          se.parts.push({ x: Math.random() * SW, y: -2, vx: (Math.random() - 0.5) * 20, vy: 20 + Math.random() * 30, c: 2 + ((Math.random() * 12) | 0) });
      }
      for (var j = se.parts.length - 1; j >= 0; j--) {
        var q = se.parts[j];
        q.x += q.vx * dt; q.y += q.vy * dt;
        if (q.y > SH + 2 || q.x < -2) se.parts.splice(j, 1);
      }
      if (se.parts.length > 220) se.parts.splice(0, se.parts.length - 220);
    },
    drawEffects: function () {
      var i, p;
      var cx = camX(), cy = camY();
      for (i = 0; i < this.particles.length; i++) {
        p = this.particles[i];
        var px = (p.x | 0) - cx, py = (p.y | 0) - cy;
        if (px >= 0 && px < SW && py >= 0 && py < SH) this.screen.data[py * SW + px] = p.color & 0x0f;
      }
      if (this.screenEffect) {
        for (i = 0; i < this.screenEffect.parts.length; i++) {
          p = this.screenEffect.parts[i];
          var x2 = p.x | 0, y2 = p.y | 0;
          if (x2 >= 0 && x2 < SW && y2 >= 0 && y2 < SH) this.screen.data[y2 * SW + x2] = p.c & 0x0f;
        }
      }
    }
  };

  /* 帧动画：按 clock 推进 _curAnim 的帧，直接把 _img 换成当前帧 */
  function updateSpriteAnim(s) {
    if (s._curAnim == null) return;
    var a = s._anims[s._curAnim];
    if (!a || !a.frames || !a.frames.length) return;
    var dur = a.interval || 100;
    if (dur < 20) dur = 20;
    var idx = Math.floor((g.clock - (s._animStart || 0)) / dur);
    if (idx < 0) idx = 0;
    var f = a.frames[idx % a.frames.length];
    if (f && f !== s._img) s._img = f;
  }

  function fxName(fx) { return (fx && fx.__name) || "none"; }
  function makeEffect(name) {
    return {
      __name: name,
      startScreenEffect: function (duration) { Graphics.startScreenEffect(name); },
      endScreenEffect: function () { Graphics.screenEffect = null; }
    };
  }
  var effects = {};
  ["blizzard", "blizzard2", "confetti", "sparkles", "bubbles", "stars", "smoke",
    "fountain", "hearts", "flames", "ash", "melt", "trails", "warmRadial",
    "coolRadial", "disintegrate"].forEach(function (n) { effects[n] = makeEffect(n); });
  // pxt 里部分特效有单复数两种写法
  effects.ashes = effects.ash;
  effects.ash2 = effects.ash;
  effects.spray = effects.sparkles;
  effects.sparks = effects.sparkles;
  effects.trail = effects.trails;
  effects.trail2 = effects.trails;

  // pxt 的特效列表随版本增减（clouds / blizzard2 / spray…）。
  // 这里用 Proxy 兜底：叫不出名字的特效直接按"同名屏幕特效"生成，
  // 免得每个新游戏都因为一个没收录的特效名整局加载失败。
  if (typeof Proxy === "function") {
    effects = new Proxy(effects, {
      get: function (t, k) {
        if (typeof k !== "string") return t[k];
        if (!(k in t)) t[k] = makeEffect(k);
        return t[k];
      }
    });
  }

  // ---------------- sprites ----------------

  var sprites = {
    create: function (img, kind) {
      var s = new Sprite(img, kind);
      s._x = SW / 2; s._y = SH / 2;
      if (kind === SpriteKind.Player && !g.player) g.player = s;
      g.sprites.push(s);
      fireList(sprites._onCreated, [s]);
      return s;
    },
    createProjectileFromSide: function (img, vx, vy) {
      var s = this.create(img, SpriteKind.Projectile);
      s.vx = vx; s.vy = vy;
      return s;
    },
    createProjectileFromSprite: function (img, from, vx, vy) {
      var s = this.create(img, SpriteKind.Projectile);
      s.setPosition(from._x, from._y);
      s.vx = vx; s.vy = vy;
      return s;
    },
    allOfKind: function (kind) {
      var r = [];
      for (var i = 0; i < g.sprites.length; i++) if (g.sprites[i].kind === kind && g.sprites[i]._alive) r.push(g.sprites[i]);
      return r;
    },
    destroyAllSpritesOfKind: function (kind) {
      for (var i = 0; i < g.sprites.length; i++)
        if (g.sprites[i].kind === kind) g.sprites[i].destroy();
    },
    onOverlap: function (k1, k2, cb) {
      g.overlapHandlers.push({ k1: k1, k2: k2, cb: cb });
    },
    onCreated: function (cb) { (sprites._onCreated || (sprites._onCreated = [])).push(cb); },
    onDestroyed: function (k, cb) { (sprites._onDestroyed || (sprites._onDestroyed = [])).push(cb); },
    _onCreated: null,
    _onDestroyed: null
  };

  // ---------------- screen（叠加在精灵之上的一层，游戏用来画 HUD/文字） ----------------

  var screen = {
    width: SW,
    height: SH,
    print: function (text, x, y, color) {
      drawText(Graphics.screen, text, x | 0, y | 0, color === undefined ? 1 : color);
    },
    printCenter: function (text, y, color) {
      var t = String(text);
      drawText(Graphics.screen, t, Math.round((SW - t.length * 4) / 2), y | 0, color === undefined ? 1 : color);
    },
    printAt: function (text, x, y, color) { screen.print(text, x, y, color); },
    clear: function () { Graphics.clear(g.bgColor); },
    fill: function (c) { for (var i = 0; i < SW * SH; i++) Graphics.screen.data[i] = c & 0x0f; },
    setPixel: function (x, y, c) { Graphics.screen.setPixel(x | 0, y | 0, c); },
    getPixel: function (x, y) { return Graphics.screen.getPixel(x | 0, y | 0); },
    drawImage: function (img, x, y) {
      if (!img) return;
      for (var yy = 0; yy < img.height; yy++)
        for (var xx = 0; xx < img.width; xx++) {
          var c = img.data[yy * img.width + xx];
          if (c) Graphics.screen.setPixel((x | 0) + xx, (y | 0) + yy, c);
        }
    },
    drawLine: function (x0, y0, x1, y1, c) { drawLineOn(Graphics.screen, x0, y0, x1, y1, c); },
    drawRect: function (x, y, w, h, c) {
      for (var i = 0; i < w; i++) { Graphics.screen.setPixel(x + i, y, c); Graphics.screen.setPixel(x + i, y + h - 1, c); }
      for (var j = 0; j < h; j++) { Graphics.screen.setPixel(x, y + j, c); Graphics.screen.setPixel(x + w - 1, y + j, c); }
    },
    fillRect: function (x, y, w, h, c) {
      for (var jj = 0; jj < h; jj++) for (var ii = 0; ii < w; ii++) Graphics.screen.setPixel(x + ii, y + jj, c);
    }
  };

  function drawScoreBadge(pi, right) {
    if (!pi || !pi._shown) return;
    var t = String(pi._score);
    var w = t.length * 4 + 5, h = 9;
    var x = right ? SW - w - 2 : 2, y = 2;
    for (var j = 0; j < h; j++)
      for (var i = 0; i < w; i++) {
        var edge = (i === 0 || j === 0 || i === w - 1 || j === h - 1);
        Graphics.screen.setPixel(x + i, y + j, edge ? pi.bg : 0);
      }
    drawText(Graphics.screen, t, x + 3, y + 2, 1);
  }

  function drawLineOn(img, x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    var err = dx + dy;
    for (;;) {
      img.setPixel(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // ---------------- scene / game / info ----------------

  var scene = {
    screenWidth: function () { return SW; },
    screenHeight: function () { return SH; },
    setBackgroundColor: function (c) { g.bgColor = c & 0x0f; },
    setBackgroundImage: function (img) { g.bgImage = img; },
    /*
     * color-coded-tilemap 扩展的两个入口（扩展本身不在卡带里，但 API 语义很直白）：
     *   scene.setTile(编号, 图块, 是否挡路)
     *   scene.setTileMap(img`...`)   —— img 的每个像素值就是该格用的编号
     * 我们的 Tilemap 单元本来就是 Image，所以直接把编号映射成图块即可。
     */
    setTile: function (index, img, wall) {
      g.ccTiles[index | 0] = { img: img || null, wall: !!wall };
      if (img && wall !== undefined) img._solid = !!wall;
      // 这个扩展的实际用法是"先 setTileMap 再 setTile"，所以每次注册图块都要重建一次
      if (g.ccMap) scene.setTileMap(g.ccMap);
    },
    setTileMap: function (mapImg) {
      if (!mapImg || !mapImg.data) return;
      g.ccMap = mapImg;
      var w = mapImg.width, h = mapImg.height;
      var cells = new Array(w * h);
      for (var ci = 0; ci < w * h; ci++) {
        var def = g.ccTiles[mapImg.data[ci]];
        cells[ci] = def ? def.img : null;
      }
      scene.setTilemap(new Tilemap(w, h, cells, 16));
    },
    cameraFollowSprite: function (s) { g.cam.follow = s || null; updateCamera(); },
    centerCameraAt: function (x, y) { g.cam.follow = null; g.cam.x = x - SW / 2; g.cam.y = y - SH / 2; clampCamera(); },
    cameraShake: function (amp, dur) {
      var a = typeof amp === "number" ? amp : 2;
      var d = typeof dur === "number" ? dur : 500;
      g.cam.shakeAmp = Math.max(0, a);
      g.cam.shakeUntil = g.clock + Math.max(0, d);
    },
    setTilemap: function (tm) { tiles.setTilemap(tm); },
    onOverlapTile: function (kind, tile, cb) {
      g.tileOverlapHandlers.push({ kind: kind, tile: tile, cb: cb });
    },
    onHitWall: function (kind, cb) { g.wallHandlers.push({ kind: kind, cb: cb }); },
    onRedraw: function () { },
    setDialog: function () { },
    showDialog: function () { }
  };

  var game = {
    onUpdate: function (cb) { g.updateHandlers.push(cb); },
    onUpdateInterval: function (ms, cb) { g.intervalHandlers.push({ ms: ms, last: nowMs(), cb: cb }); },
    onPaint: function (cb) { g.paintHandlers.push(cb); },
    onShade: function (cb) { g.shadeHandlers.push(cb); },
    over: function (win) {
      if (g.gameOver) return;
      g.gameOver = true;
      Graphics.drawCenterText = win === false ? "GAME OVER" : "YOU WIN";
    },
    splash: function (text, ms) {
      Dialog.splash(String(text), ms || 1200);
    },
    showLongText: function (text, layout) { Dialog.open(String(text), layout); },
    showDialog: function (text, layout) { Dialog.open(String(text), layout); },
    setDialogFrame: function (img) { Dialog.frame = img; },
    setDialogCursor: function (img) { Dialog.cursor = img; },
    setDialogImage: function (img) { Dialog.frame = img; },
    showScore: function () { },
    setLife: function (n) { g.life = n; },
    addLife: function (n) { g.life += n; },
    setScore: function (n) { g.score = n; },
    runtime: function () { return g.clock; },
    currentTime: function () { return g.clock; }
  };

  var info = {
    setScore: function (n) { info.player1.setScore(n); g.score = n; },
    changeScoreBy: function (n) { info.player1.changeScoreBy(n); g.score = info.player1.getScore(); },
    getScore: function () { return info.player1.getScore(); },
    setLife: function (n) { info.player1.setLife(n); },
    changeLifeBy: function (n) { info.player1.changeLifeBy(n); },
    getLife: function () { return info.player1.getLife(); },
    setHighScore: function (n) { g.high = n; },
    player1: null,
    player2: null
  };
  function makePlayerInfo(bg) {
    // 每个玩家有独立分数/生命；showPlayer 控制屏幕上是否画计分牌
    var pi = {
      bg: bg,
      showPlayer: true,
      _score: 0, _lives: 0,
      _shown: false,
      setScore: function (n) { pi._score = n | 0; pi._shown = true; },
      changeScoreBy: function (n) { pi._score += n | 0; pi._shown = true; },
      getScore: function () { return pi._score; },
      setLife: function (n) { pi._lives = n | 0; },
      changeLifeBy: function (n) { pi._lives += n | 0; },
      getLife: function () { return pi._lives; },
      setPosition: function () { }
    };
    return pi;
  }
  info.player1 = makePlayerInfo(2);   // 红
  info.player2 = makePlayerInfo(8);   // 深蓝

  // ---------------- animation ----------------

  var ActionKind = {};
  var animation = {
    createAnimation: function (kind, interval) {
      var a = { name: kind, interval: interval, frames: [], __isAnim: true };
      (g.anims || (g.anims = [])).push(a);
      return a;
    },
    attachAnimation: function (sprite, anim) {
      if (!sprite || !anim) return;
      sprite._anims[anim.name] = anim;
      if (sprite._curAnim === null) sprite._curAnim = anim.name;
      return sprite;
    },
    setAction: function (sprite, kind) {
      if (!sprite) return;
      // 游戏通常每帧都调 setAction；动作没变时不能重置起始时间，
      // 否则播放进度永远是 0，精灵看起来是静止的。
      if (sprite._curAnim !== kind) {
        sprite._curAnim = kind;
        sprite._animStart = nowMs();
      }
    },
    addAnimationFrame: function (anim, frame) {
      if (anim && anim.frames) anim.frames.push(frame);
    },
    stopAnimation: function () { },
    animateImage: function () { }
  };

  // Animation 实例方法（pxt 里 Animation.addAnimationFrame 是实例方法）
  function patchAnimObject(anim) {
    anim.addAnimationFrame = function (frame) { animation.addAnimationFrame(anim, frame); return anim; };
    anim.setFrame = function () { return anim; };
    anim.getDuration = function () { return anim.interval || 100; };
    return anim;
  }
  var _createAnimation = animation.createAnimation;
  animation.createAnimation = function (kind, interval) {
    return patchAnimObject(_createAnimation(kind, interval));
  };

  // ---------------- controller ----------------

  var ControllerButtonEvent = { Pressed: 1, Released: 2, Repeated: 3, Repeat: 3 };
  var BUTTON_NAMES = ["left", "right", "up", "down", "A", "B", "menu"];

  function Button(name, prefix) {
    this.name = name;
    this.key = (prefix || "") + name;
    this._fns = {};
    this.onEvent = function (ev, cb) {
      (this._fns[ev] || (this._fns[ev] = [])).push(cb);
      return this;
    };
    this.isPressed = function () {
      if (this.name === "*") return this.key ? false : g.anyPressed;
      return !!g.buttonsDown[this.key];
    };
    this.repeat = function () { return this; };
    this.getPressed = function () { return this.isPressed(); };
  }

  function makePlayer(prefix) {
    var pc = {
      prefix: prefix || "",
      left: new Button("left", prefix), right: new Button("right", prefix),
      up: new Button("up", prefix), down: new Button("down", prefix),
      A: new Button("A", prefix), B: new Button("B", prefix),
      menu: new Button("menu", prefix),
      anyButton: new Button("*", prefix || "p2."),
      moveSprite: function (sprite, vx, vy) {
        // 真机语义：不是"调一次就把速度定下来"，而是登记一个每帧 mover，
        // 由 tick 在 onUpdate 之前按当前按键重算速度。只算一次的话，
        // 加载时没人按键 -> vx/vy 恒为 0，之后按方向键也不会有任何反应
        // （ping 这类用 controller.moveSprite 驱动的游戏就是这样"方向键失灵"）。
        if (!sprite) return;
        // pxt 的默认值是两个轴都 100（四方向移动）。只写 controller.moveSprite(s)
        // 的游戏（cube land 就是）之前拿到 undefined，角色一步都不动。
        if (vx === undefined) vx = 100;
        if (vy === undefined) vy = 100;
        for (var i = 0; i < g.movers.length; i++) {
          if (g.movers[i].sprite === sprite) {
            g.movers[i].vx = vx; g.movers[i].vy = vy; g.movers[i].pc = pc;
            return;
          }
        }
        g.movers.push({ sprite: sprite, vx: vx, vy: vy, pc: pc });
      },
      dx: function () {
        var d = 0;
        if (pc.left.isPressed()) d -= 1;
        if (pc.right.isPressed()) d += 1;
        return d;
      },
      dy: function () {
        var d = 0;
        if (pc.up.isPressed()) d -= 1;
        if (pc.down.isPressed()) d += 1;
        return d;
      },
      setRepeatDefault: function () { }
    };
    return pc;
  }

  var controller = makePlayer("");
  // 玩家 2：libretro 端口 0 以外的输入本版没有接线，按键恒为松开，
  // 但对象要存在——大量双人游戏（如 ping）会在初始化时就引用它。
  controller.player2 = makePlayer("p2.");
  controller.player1 = controller;
  controller.setRepeatDefault = function (delay, interval) {
    g.repeatDelay = Math.max(0, delay | 0);
    g.repeatInterval = Math.max(1, interval | 0);
  };
  controller.setRepeat = function (delay, interval) { controller.setRepeatDefault(delay, interval); };


  // ---------------- 系统菜单（照 pxt-common-packages/libs/game/systemmenu.ts） ----------------
  //
  // 真机按 MENU 弹的是 pxt 内置的 PauseMenu，不是"继续/重开/静音"那种竖排列表：
  //   顶部黑条 + "PAUSED"（doubledFont，16px 高）
  //   中间 36x36 卡片网格，每行 4 张，卡片按 2px 正弦上下浮动
  //   底部黑条 + 白色信息条，居中显示当前卡片名称
  //   左右 = ±1 格，上下 = ±1 行（4 格），A 按下变"按下态"、松开执行，B / MENU 关闭
  // 游戏自己写了 controller.menu.onEvent(...) 时整体让位（同真机"同事件一个 handler"的规则）。

  var MENU_CARD_W = 36, MENU_SPACING = 3, MENU_PER_ROW = 4, MENU_PADDING = 3;
  var MENU_CARDS_TOP = 21;      // headerFont.charHeight(16) + 2 + spacing(3)
  var MENU_INFO_TOP = 110;      // screen.height(120) - font8(8) - 2

  var activeRuntime = null;

  // 字体与图标：由 tools/gen_menu_assets.py 从 pxt 原始资源生成
  var menuCache = null;

  function menuAssets() {
    if (menuCache) return menuCache;
    menuCache = { font: null, imgs: {} };
    var src = (typeof MenuAssets !== "undefined") ? MenuAssets : null;
    if (!src) return menuCache;
    var hex = src.font8, f = new Uint8Array(hex.length >> 1), i;
    for (i = 0; i < f.length; i++) f[i] = parseInt(hex.substr(i * 2, 2), 16);
    menuCache.font = f;
    for (var k in src.imgs) {
      var d = src.imgs[k], img = new Image(d.w, d.h);
      for (i = 0; i < d.w * d.h; i++) img.data[i] = parseInt(d.d.charAt(i), 16);
      menuCache.imgs[k] = img;
    }
    return menuCache;
  }

  // pxt 的 font8 是 8x8 等宽；scale=2 就是 image.doubledFont(font8)
  function drawFontText(img, str, x, y, color, scale) {
    var A = menuAssets();
    str = String(str).toUpperCase();
    scale = scale || 1;
    if (!A.font) { drawText(img, str, x, y, color); return; }
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i) - 32;
      if (code < 0 || code > 94) continue;
      for (var row = 0; row < 8; row++) {
        var bits = A.font[code * 8 + row];
        if (!bits) continue;
        for (var col = 0; col < 8; col++) {
          if (!(bits & (1 << (7 - col)))) continue;
          var px = x + (i * 8 + col) * scale, py = y + row * scale;
          if (scale === 1) img.setPixel(px, py, color);
          else for (var a = 0; a < scale; a++) for (var b = 0; b < scale; b++) img.setPixel(px + a, py + b, color);
        }
      }
    }
  }

  function printCenterFont(str, y, color, scale) {
    var t = String(str);
    var w = t.length * 8 * (scale || 1);
    drawFontText(Graphics.screen, t, Math.round((SW - w) / 2), y, color, scale);
  }

  function menuVolume(up) {
    // 原版：volumeUp = v + 32 - v%32，volumeDown = v - (v%32 || 32)
    var v = music.volume(), rem = v % 32;
    music.setVolume(up ? v + 32 - rem : v - (rem ? rem : 32));
    if (g.volume > 0) tone(440, 400);   // 真机 setVolume 会响一声 440Hz 让你试音量
  }

  function systemMenuItems() {
    return [
      { icon: "VOLUME_DOWN_ICON", text: function () { return "VOLUME DOWN (" + g.volume + ")"; },
        act: function () { menuVolume(false); } },
      { icon: "VOLUME_UP_ICON", text: function () { return "VOLUME UP (" + g.volume + ")"; },
        act: function () { menuVolume(true); } },
      { icon: "STATS_ICON", text: function () { return g.showStats ? "HIDE STATS" : "SHOW STATS"; },
        act: function () { g.showStats = !g.showStats; } },
      { icon: "CONSOLE_ICON", text: function () { return g.showConsole ? "HIDE CONSOLE" : "SHOW CONSOLE"; },
        act: function () { g.showConsole = !g.showConsole; } },
      { icon: "SLEEP_ICON", text: function () { return "SLEEP"; },
        act: function () { /* 核心没有 power.deepSleep，和模拟器一样空转 */ } },
      { icon: "CLOSE_MENU_ICON", text: function () { return "CLOSE"; },
        act: function () { closeSystemMenu(); } }
    ];
  }

  function openSystemMenu() {
    g.sysMenu.open = true;
    g.sysMenu.index = 0;
    g.sysMenu.active = false;
  }

  function closeSystemMenu() {
    g.sysMenu.open = false;
    g.sysMenu.active = false;
  }

  function drawSystemMenu() {
    var A = menuAssets();
    var scr = Graphics.screen;
    var items = systemMenuItems();
    var sel = g.sysMenu.index | 0;
    if (sel >= items.length) sel = g.sysMenu.index = items.length - 1;
    var t = g.clock / 250;   // 真机：control.millis()/250
    var i;

    // 卡片先画，上下两条横条后画，正好压在卡片边缘之外
    for (i = 0; i < items.length; i++) {
      var col = i % MENU_PER_ROW, row = (i / MENU_PER_ROW) | 0;
      var bob = Math.round(2 * Math.sin(t - (i % MENU_PER_ROW) * (Math.PI / 2)));
      var cx = MENU_PADDING + col * (MENU_CARD_W + MENU_SPACING);
      var cy = MENU_CARDS_TOP + row * (MENU_CARD_W + MENU_SPACING) + bob;
      var card = i === sel ? (g.sysMenu.active ? "CARD_ACTIVE" : "CARD_SELECTED") : "CARD_NORMAL";
      if (A.imgs[card]) scr.drawImage(A.imgs[card], cx, cy);
      if (A.imgs[items[i].icon]) scr.drawImage(A.imgs[items[i].icon], cx + 2, cy + 2);
    }

    // 顶部：黑条 + PAUSED（白字，2 倍字高）
    scr.fillRect(0, 0, SW, MENU_CARDS_TOP - 2, 15);
    printCenterFont("PAUSED", 2, 1, 2);

    // 底部：黑条 + 白信息条 + 当前卡片名称（黑字）
    scr.fillRect(0, MENU_INFO_TOP - 3, SW, SH - MENU_INFO_TOP + 6, 15);
    scr.fillRect(MENU_PADDING, MENU_INFO_TOP, SW - MENU_PADDING * 2, 9, 1);
    printCenterFont(items[sel].text(), MENU_INFO_TOP + 1, 15, 1);
  }

  // 系统菜单里的 SHOW STATS / SHOW CONSOLE 得有东西可看，这里画两个小覆盖层
  function drawStatsOverlay() {
    var scr = Graphics.screen;
    scr.fillRect(0, 0, 62, 21, 15);
    drawText(scr, "FPS " + (g.fps | 0), 2, 2, 1);
    drawText(scr, "SPR " + g.sprites.length, 2, 8, 1);
    drawText(scr, "PAR 0", 2, 14, 1);
  }

  function drawConsoleOverlay() {
    var scr = Graphics.screen, n = Math.min(g.logLines.length, 5);
    if (!n) return;
    var h = n * 7 + 3, y0 = SH - h;
    scr.fillRect(0, y0, SW, h, 15);
    for (var i = 0; i < n; i++) {
      var line = String(g.logLines[g.logLines.length - n + i]).slice(0, 38);
      drawText(scr, line, 2, y0 + 2 + i * 7, 1);
    }
  }

  // 所有声音都从这里出去，静音开关才管得住
  function tone(freq, ms) {
    if (g.volume <= 0) return;
    if (Host.tone) Host.tone(freq, ms, g.volume);
  }


  // ---------------- 旋律（music.Melody / playMelody） ----------------

  /*
   * pxt 的旋律串：`C5:1 D5:1 R:1` —— 音名[#|b]八度:拍数，单独一个 `:2` 是休止。
   * 一个 beat = 60/tempo 秒（默认 120 → 500ms）。
   */
  var NOTE_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function parseMelody(str) {
    var out = [];
    var parts = String(str == null ? "" : str).split(/\s+/);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p) continue;
      var m = /^([A-G])([#b]?)(-?\d+)?(?::(\d+(?:\.\d+)?))?$/.exec(p);
      if (!m) {                      // "R" 或者干脆是 ":" 开头的休止
        var rest = /^R?(?::(\d+(?:\.\d+)?))?$/i.exec(p);
        out.push({ freq: 0, beats: rest && rest[1] ? parseFloat(rest[1]) : 1 });
        continue;
      }
      var semi = NOTE_SEMI[m[1]] + (m[2] === "#" ? 1 : (m[2] === "b" ? -1 : 0));
      var oct = m[3] === undefined ? 4 : parseInt(m[3], 10);
      var beats = m[4] === undefined ? 1 : parseFloat(m[4]);
      var midi = 12 * (oct + 1) + semi;
      out.push({ freq: Math.round(440 * Math.pow(2, (midi - 69) / 12)), beats: beats });
    }
    return out;
  }

  function startMelody(notes, loops, tempo) {
    if (!notes || !notes.length) return;
    g.melody = {
      notes: notes, idx: 0, loopsLeft: loops,
      beatMs: 60000 / (tempo || g.tempo || 120),
      nextAt: g.clock
    };
  }

  // 每帧推进：pxt 是开一个纤维去播，这里挂在 tick 上
  function updateMelody() {
    var m = g.melody;
    if (!m) return;
    if (g.clock < m.nextAt) return;
    var n = m.notes[m.idx];
    if (!n) {
      m.loopsLeft--;
      if (m.loopsLeft <= 0) { g.melody = null; return; }
      m.idx = 0;
      n = m.notes[0];
    }
    var dur = Math.max(50, m.beatMs * n.beats);
    if (n.freq && g.volume > 0) tone(n.freq, Math.round(dur * 0.9));
    m.idx++;
    m.nextAt = g.clock + dur;
  }

  function Melody(src) {
    this._notes = parseMelody(src);
    this._playing = false;
  }
  Melody.prototype.play = function (loops) {
    this._playing = true;
    startMelody(this._notes, loops === undefined ? 1 : loops, g.tempo);
    return this;
  };
  Melody.prototype.loop = function (times) {
    return this.play(times === undefined ? 1 : times);
  };
  Melody.prototype.stop = function () {
    this._playing = false;
    g.melody = null;
    if (Host.audioStop) Host.audioStop();
    return this;
  };
  Melody.prototype.getTempo = function () { return g.tempo; };

  // ---------------- music（v1 只登记，播放交给宿主） ----------------

  var music = {
    setVolume: function (v) { g.volume = clamp(v | 0, 0, 255); },
    volume: function () { return g.volume; },
    stopAllSounds: function () { if (Host.audioStop) Host.audioStop(); },
    playTone: function (freq, ms) { tone(freq, ms); },
    playToneEffect: function (freq, ms) { tone(freq, ms); },
    ringTone: function (freq, ms) { tone(freq, ms); },
    beat: function () { return 0; },
    Melody: Melody,
    melodyPlayable: function (m) { return new Melody(m); },
    playMelody: function (m, tempo) {
      if (tempo) g.tempo = tempo;
      startMelody(parseMelody(m), 1, g.tempo);
    },
    playSound: function (s) { },
    stopMelody: function () { g.melody = null; },
    setTempo: function (t) { g.tempo = t || 120; },
    changeTempo: function (d) { g.tempo = Math.max(20, (g.tempo || 120) + (d || 0)); },
    tempo: function () { return g.tempo || 120; },
    noteFrequency: function (n) { return Math.round(440 * Math.pow(2, ((n | 0) - 69) / 12)); }
  };
  var BeatFraction = { Whole: 1, Half: 2, Quarter: 4, Eighth: 8, Sixteenth: 16, Double: 32, Breve: 0.5 };
  // pxt 的 music.*.play() 预置旋律：真机是 20 来首内置曲子，这里只需要"能响、有区分度"。
  ["powerUp", "powerDown", "baDing", "jumpUp", "jumpDown", "spring", "magicWand", "siren",
    "knuckleCrack", "pewPew", "thump", "zap", "buzz", "wow", "sad", "happy"].forEach(function (n, i) {
      music[n] = {
        play: function () { tone(220 + (i % 8) * 110, 120); return this; },
        stop: function () { if (Host.audioStop) Host.audioStop(); return this; },
        loop: function () { tone(220 + (i % 8) * 110, 200); return this; }
      };
    });

  // ==========================================================================
  // 资源系统：.jres（MakeCode 的静态资源包）+ mkcd-f4 图片 + assets.* 字面量
  //
  // 这是"换一个游戏就加载失败"的根因：pxt 工程里除了 main.ts，还有 images.g.ts /
  // images.g.jres / tilemap.g.ts / tilemap.g.jres。真正的像素在 .jres 里（base64
  // 的 mkcd-f4 位图），生成代码只是给类型系统看的壳子（image.ofBuffer(hex``) 是空的）。
  // 所以这里直接读 .jres 建注册表，并且按名字把 .g.ts 里的 tilemap 网格解析出来，
  // 保证 assets.tile`tile1` 和 tilemap 图例指向同一个 Image 对象（引用相等）。
  // ==========================================================================

  var B64CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function b64decode(str) {
    var s = String(str || "").replace(/[^A-Za-z0-9+\/=]/g, "");
    var out = [], acc = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === "=") break;
      var v = B64CHARS.indexOf(c);
      if (v < 0) continue;
      acc = (acc << 6) | v;
      bits += 6;
      if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); }
    }
    return new Uint8Array(out);
  }

  function hexToBytes(str) {
    var s = String(str || "").replace(/[^0-9a-fA-F]/g, "");
    var out = new Uint8Array(s.length >> 1);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
    return out;
  }

  /*
   * mkcd-f4（image/x-mkcd-f4）：
   *   8 字节头 = 0x87, bpp, width(LE16), height(LE16), 0, 0
   *   之后按 bpp 打包：4bpp 时每字节两像素（高半字节在前）
   * 空缓冲区（生成代码里的占位 tile）退化成 16x16 全透明。
   */
  function imageFromBuffer(buf, defW, defH) {
    if (!buf || buf.length < 8 || buf[0] !== 0x87) return new Image(defW || 16, defH || 16);
    var bpp = buf[1];
    var w = buf[2] | (buf[3] << 8), h = buf[4] | (buf[5] << 8);
    if (!w || !h || w > 1024 || h > 1024) return new Image(defW || 16, defH || 16);
    var img = new Image(w, h), n = w * h, p = 8, i;
    if (bpp === 4 || bpp === 0) {
      for (i = 0; i < n; i++) {
        var b = buf[p + (i >> 1)] || 0;
        img.data[i] = (i & 1) ? (b & 0x0f) : ((b >> 4) & 0x0f);
      }
    } else if (bpp === 1) {
      for (i = 0; i < n; i++) {
        var b1 = buf[p + (i >> 3)] || 0;
        img.data[i] = (b1 >> (7 - (i & 7))) & 1;
      }
    } else {
      for (i = 0; i < n; i++) img.data[i] = (buf[p + i] || 0) & 0x0f;
    }
    return img;
  }

  function tileIsSolid(tile) {
    if (!tile) return false;
    if (tile._solid === undefined) {
      var s = false;
      for (var i = 0; i < tile.data.length; i++) if (tile.data[i]) { s = true; break; }
      tile._solid = s;
    }
    return tile._solid;
  }

  var Assets = {
    image: {}, tile: {}, tilemap: {}, animation: {},
    namespaces: {},             // "myTiles"/"myImages" -> {name: Image}，给直接引用命名空间的代码用
    byName: {},                 // 名字 -> {kind, value}，跨命名空间的兜底索引
    reset: function () {
      this.image = {}; this.tile = {}; this.tilemap = {}; this.animation = {};
      this.namespaces = {};
      this.byName = {};
    },
    putInNamespace: function (ns, name, value) {
      if (!ns) return;
      var o = this.namespaces[ns] || (this.namespaces[ns] = {});
      o[name] = value;
    },
    add: function (kind, name, value, ns) {
      if (!name || value == null) return value;
      this[kind][name] = value;
      if (!this.byName[name]) this.byName[name] = { kind: kind, value: value };
      this.putInNamespace(ns, name, value);
      return value;
    },
    /* 按 kind+名字取；取不到时回落到同名资源，再回落到 .g.ts 注册的工厂函数 */
    get: function (kind, name) {
      name = String(name == null ? "" : name).replace(/^\s+|\s+$/g, "");
      var v = this[kind] && this[kind][name];
      if (v != null) return v;
      var e = this.byName[name];
      if (e && (e.kind === kind || kind === "image" || kind === "tile")) return e.value;
      var fs = g.factories[kind];
      if (fs) {
        for (var i = 0; i < fs.length; i++) {
          var r = null;
          try { r = fs[i](name); } catch (err) { r = null; }
          if (r != null) return r;
        }
      }
      return null;
    }
  };

  // tiles.Location：pxt 里 location 同时能当"格子"和"像素"用，两种读法都给。
  function Location(x, y) {
    this.x = x | 0;
    this.y = y | 0;
    this.column = this.x >> 4;
    this.row = this.y >> 4;
  }
  Location.prototype.toString = function () { return "Location(" + this.column + "," + this.row + ")"; };

  function Tilemap(w, h, cells, scale) {
    this.width = w;
    this.height = h;
    this.cells = cells || [];            // Image | null，行优先
    this.tileWidth = 16;
    this.tileHeight = 16;
    this.scale = scale || 16;
    this.pixelWidth = w * 16;
    this.pixelHeight = h * 16;
  }
  Tilemap.prototype.getTile = function (col, row) {
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) return null;
    return this.cells[row * this.width + col] || null;
  };
  Tilemap.prototype.setTile = function (col, row, tile) {
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) return;
    this.cells[row * this.width + col] = tile || null;
  };

  function makeTilemapFromBuffer(buf, legend, scale) {
    if (!buf || buf.length < 4) return null;
    var w = buf[0] | (buf[1] << 8), h = buf[2] | (buf[3] << 8);
    if (!w || !h) return null;
    var cells = new Array(w * h);
    for (var i = 0; i < w * h; i++) {
      var code = buf[4 + i] || 0;
      cells[i] = (legend && legend[code]) || null;
    }
    return new Tilemap(w, h, cells, scale || 16);
  }

  /* 解析 tilemap.g.ts 里的 tiles.createTilemap(hex`..`, img`..`, [myTiles.tile0..], TileScale.Sixteen) */
  function parseTilemapsFromGts(text) {
    var srcText = String(text || "");
    var re = /case\s+"([^"]+)"\s*:\s*(?:case\s+"[^"]+"\s*:\s*)?return\s+tiles\.createTilemap\(\s*hex`([0-9a-fA-F]*)`\s*,\s*img`[^`]*`\s*,\s*\[([^\]]*)\]\s*,\s*TileScale\.([A-Za-z]+)\s*\)/g;
    var m, count = 0;
    while ((m = re.exec(srcText)) !== null) {
      var name = m[1];
      var bytes = hexToBytes(m[2]);
      var legend = [];
      var items = m[3].split(",");
      for (var i = 0; i < items.length; i++) {
        var ref = items[i].replace(/^\s+|\s+$/g, "");
        if (!ref) continue;
        var short = ref.replace(/^.*\./, "");
        legend.push(Assets.get("tile", short) || Assets.get("image", short) || null);
      }
      var scale = m[4] === "ThirtyTwo" ? 32 : 16;
      var tm = makeTilemapFromBuffer(bytes, legend, scale);
      if (tm) { Assets.add("tilemap", name, tm, "myTiles"); count++; }
    }
    return count;
  }

  function parseJres(text) {
    var o;
    try { o = JSON.parse(text); } catch (e) { Host.warn("jres 解析失败: " + (e && e.message)); return; }
    var meta = o["*"] || {};
    var ns = meta.namespace || "";
    for (var k in o) {
      if (!o.hasOwnProperty(k) || k === "*") continue;
      var v = o[k], mime = meta.mimeType || "", data = null;
      if (typeof v === "string") data = v;
      else if (v && typeof v === "object") { data = v.data; mime = v.mimeType || mime; }
      if (typeof data !== "string") continue;
      if (mime.indexOf("image/") === 0) {
        // myTiles 命名空间里的图是"图块"，其余是普通图片；两者都是 Image
        var kind = (ns === "myTiles") ? "tile" : "image";
        Assets.add(kind, k, imageFromBuffer(b64decode(data), 16, 16), ns);
      } else if (mime.indexOf("tilemap") >= 0) {
        // 网格数据交给我们自己的 .g.ts 解析器（jres 里的文本编码格式太怪）
        Assets.add("tilemap", k, Assets.get("tilemap", k));
      }
    }
  }

  function loadProjectAssets(files) {
    Assets.reset();
    var name;
    for (name in files) if (files.hasOwnProperty(name) && /\.jres$/i.test(name)) parseJres(files[name]);
    for (name in files) if (files.hasOwnProperty(name) && /\.g\.ts$/i.test(name)) parseTilemapsFromGts(files[name]);
  }

  // ---------------- helpers / assets（生成代码与 main.ts 都会用到） ----------------

  var helpers = {
    stringTrim: function (s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); },
    _registerFactory: function (kind, fn) {
      if (typeof fn !== "function") return;
      (g.factories[kind] || (g.factories[kind] = [])).push(fn);
    },
    _registerPackage: function () { },
    registerAsset: function () { },
    mkClass: function () { return function () { }; },
    getAsset: function (name, kind) { return Assets.get(kind || "image", name); }
  };

  function assetTag(kind) {
    return function (strings) {
      var name = strings && strings.raw ? strings.raw[0] : String(strings);
      var v = Assets.get(kind, name);
      if (v == null) {
        Host.warn("资源缺失: " + kind + " `" + String(name).trim() + "`");
        if (kind === "tile" || kind === "image") return new Image(16, 16);
      }
      return v;
    };
  }

  var assets = {
    image: assetTag("image"),
    tile: assetTag("tile"),
    tilemap: assetTag("tilemap"),
    animation: assetTag("animation"),
    font: assetTag("image")
  };

  var TileScale = { Sixteen: 16, ThirtyTwo: 32 };
  /*
   * image.setPalette(p)：pxt 允许整局替换 16 色调色板。
   * 传进来的可能是
   *   - hex`000000 ffffff ...`  -> Uint8Array（RGB 三元组，48 字节）
   *   - ["#000000", "#ffffff", ...]
   *   - [[0,0,0], [255,255,255], ...]
   *   - 0xRRGGBB 数字数组
   * 图像本身只存 0..15 的索引，所以替换完立刻全局生效，不用重建图片。
   */
  function applyPalette(p) {
    var rgb = [];
    if (typeof p === "string") {
      var s = p.replace(/[^0-9a-fA-F]/g, "");
      for (var i = 0; i + 6 <= s.length && rgb.length < 16; i += 6)
        rgb.push(parseInt(s.substr(i, 6), 16));
    } else if (p && typeof p.length === "number") {
      var n = p.length;
      if ((n === 48 || n === 24) && typeof p[0] === "number") {
        for (var a = 0; a + 3 <= n; a += 3)
          rgb.push(((p[a] & 255) << 16) | ((p[a + 1] & 255) << 8) | (p[a + 2] & 255));
      } else {
        for (var j = 0; j < n && rgb.length < 16; j++) {
          var v = p[j];
          if (typeof v === "string") {
            var t = v.replace("#", "");
            if (/^[0-9a-fA-F]{6}/.test(t)) rgb.push(parseInt(t.substr(0, 6), 16));
          } else if (v && typeof v.length === "number") {
            rgb.push(((v[0] & 255) << 16) | ((v[1] & 255) << 8) | (v[2] & 255));
          } else if (typeof v === "number") rgb.push(v >>> 0);
        }
      }
    }
    if (!rgb.length) { Host.warn("image.setPalette: 认不出的调色板格式（" + typeof p + "）"); return; }
    for (var k = 0; k < 16; k++) {
      var c = k < rgb.length ? rgb[k] : rgb[rgb.length - 1];
      PALETTE[k] = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    }
  }

  var hex = function (strings) {
    return hexToBytes(strings && strings.raw ? strings.raw[0] : String(strings));
  };
  // tilemap`name` 是 pxt 的全局字面量（不是 assets.tilemap）
  var tilemapTag = assetTag("tilemap");

  // ---------------- tiles（图块地图 API） ----------------

  var tiles = {
    Location: Location,
    Tilemap: Tilemap,
    createTilemap: function (data, tileSheet, legend, scale) {
      // 兼容 tiles.createTilemap(hex`..`, img`..`, [...], TileScale.Sixteen) 的签名
      if (Array.isArray(legend) && legend.length && legend[0] && legend[0].hasOwnProperty && legend[0].hasOwnProperty("frames")) legend = null;
      return makeTilemapFromBuffer(data, legend, typeof scale === "function" ? 16 : scale);
    },
    getTilemap: function () { return g.tilemap; },
    setTilemap: function (tm) {
      g.tilemap = tm || null;
      // 换地图后让摄像机重新对位（跟着的精灵可能已经换了位置）
      if (g.cam.follow && g.cam.follow._alive) updateCamera();
      else { g.cam.x = 0; g.cam.y = 0; }
    },
    getTileAt: function (loc) {
      if (!g.tilemap || !loc) return null;
      return g.tilemap.getTile(loc.x >> 4, loc.y >> 4);
    },
    setTileAt: function (loc, tile) {
      if (!g.tilemap || !loc) return;
      g.tilemap.setTile(loc.x >> 4, loc.y >> 4, tile);
    },
    getTileLocation: function (col, row) { return new Location(col * 16, row * 16); },
    getTilesByType: function (tile) {
      var out = [];
      var tm = g.tilemap;
      if (!tm || !tile) return out;
      for (var row = 0; row < tm.height; row++)
        for (var col = 0; col < tm.width; col++)
          if (tm.getTile(col, row) === tile) out.push(new Location(col * 16, row * 16));
      return out;
    },
    placeOnTile: function (sprite, loc) {
      if (!sprite || !loc) return;
      sprite.setPosition(loc.x + 8, loc.y + 8);
    },
    /* 世界坐标 -> 格子 */
    getTileAtWorld: function (x, y) {
      if (!g.tilemap) return null;
      return g.tilemap.getTile((x | 0) >> 4, (y | 0) >> 4);
    },
    setTileAtWorld: function (x, y, tile) {
      if (!g.tilemap) return;
      g.tilemap.setTile((x | 0) >> 4, (y | 0) >> 4, tile);
    }
  };

  var DialogLayout = { Left: 1, Right: 2, Top: 3, Bottom: 4, Middle: 5, Center: 5, Full: 6 };
  var CollisionDirection = { Left: 1, Right: 2, Top: 3, Bottom: 4, Up: 3, Down: 4 };

  // ---------------- 对话框 / 提示条 ----------------
  //
  // pxt 里 game.showLongText 会挂起当前纤维直到玩家按 A。这里没有协程，
  // 改成"模态覆盖层"：弹出期间游戏循环暂停，按 A 翻页，翻完自动继续。
  var Dialog = {
    frame: null,
    cursor: null,
    queue: [],
    current: null,
    splashText: "",
    splashUntil: 0,
    shownAt: 0,
    open: function (text, layout) {
      this.queue.push({ text: text, layout: layout });
      if (!this.current) this.next();
    },
    next: function () {
      this.current = this.queue.length ? this.queue.shift() : null;
      this.shownAt = g.clock;
    },
    splash: function (text, ms) {
      this.splashText = text;
      this.splashUntil = g.clock + ms;
      g.splashPauseUntil = this.splashUntil;
    },
    advance: function () { if (this.current) this.next(); },
    isOpen: function () { return !!this.current; },
    isBlocking: function () { return !!this.current || g.clock < g.splashPauseUntil; },
    wrap: function (text, cols) {
      var out = [], line = "";
      var words = String(text).split(/\s+/);
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if (!line.length) line = w;
        else if ((line + " " + w).length <= cols) line += " " + w;
        else { out.push(line); line = w; }
      }
      if (line.length) out.push(line);
      return out;
    },
    draw: function () {
      var sc = Graphics.screen;
      if (this.current) {
        var lines = this.wrap(this.current.text, 34);
        var h = lines.length * 8 + 12;
        var y0 = this.current.layout === DialogLayout.Top ? 4 : SH - h - 4;
        for (var j = y0; j < y0 + h; j++)
          for (var i2 = 4; i2 < SW - 4; i2++) sc.data[j * SW + i2] = 15;
        for (var j2 = y0; j2 < y0 + h; j2++) { sc.data[j2 * SW + 4] = 1; sc.data[j2 * SW + SW - 5] = 1; }
        for (var i3 = 4; i3 < SW - 4; i3++) { sc.data[y0 * SW + i3] = 1; sc.data[(y0 + h - 1) * SW + i3] = 1; }
        for (var k = 0; k < lines.length; k++) drawText(sc, lines[k], 8, y0 + 5 + k * 8, 1);
        if (((g.clock / 400) | 0) % 2 === 0) drawText(sc, "A", SW - 12, y0 + h - 9, 2);
      } else if (g.clock < this.splashUntil) {
        var t = String(this.splashText);
        var w = t.length * 4 + 8, x = Math.round((SW - w) / 2), yy = SH / 2 - 8;
        for (var b = yy; b < yy + 16; b++)
          for (var a = x; a < x + w; a++) sc.data[b * SW + a] = 15;
        drawText(sc, t, x + 4, yy + 5, 1);
      }
    }
  };

  /*
   * 兜底命名空间：pxt 的 API 面很大，游戏里出现一个没实现的成员时，
   * 真机（以及官方运行时）不会因此整局起不来，我们也不该。
   * 缺失成员按"空操作 / 哑对象"处理，并在控制台留一条 warn，
   * 这样新游戏最多是某功能不生效，而不是卡在标题画面。
   */
  function stub(value, path) {
    if (typeof Proxy !== "function") return value;
    var f = function () { return f; };
    var p = new Proxy(f, {
      get: function (t, k) {
        if (k === Symbol.toPrimitive) return function () { return 0; };
        if (k === "toString") return function () { return "[stub " + path + "]"; };
        if (k === "valueOf") return function () { return 0; };
        if (k === "then" || k === "constructor" || k === "inspect") return undefined;
        if (!(k in t)) {
          Host.warn("未实现: " + path + "." + String(k) + "（按空操作处理）");
          t[k] = stub(null, path + "." + String(k));
        }
        return t[k];
      },
      apply: function () { return p; },
      construct: function () { return p; }
    });
    return p;
  }

  function nsStubs(target, label) {
    if (typeof Proxy !== "function") return target;
    return new Proxy(target, {
      get: function (t, k) {
        if (typeof k !== "string" || k in t) return t[k];
        if (k === "then" || k === "constructor" || k === "toString" || k === "toJSON") return t[k];
        Host.warn("未实现: " + label + "." + k + "（按空操作处理）");
        t[k] = stub(null, label + "." + k);
        return t[k];
      }
    });
  }

  // ---------------- 摄像机 ----------------

  function clampCamera() {
    var cam = g.cam;
    var tm = g.tilemap;
    if (!tm) { cam.x = clamp(cam.x, 0, 0); cam.y = clamp(cam.y, 0, 0); return; }
    var maxX = Math.max(0, tm.pixelWidth - SW), maxY = Math.max(0, tm.pixelHeight - SH);
    cam.x = clamp(cam.x, 0, maxX);
    cam.y = clamp(cam.y, 0, maxY);
  }

  function updateCamera() {
    var cam = g.cam;
    if (cam.follow) {
      if (!cam.follow._alive) cam.follow = null;
      else { cam.x = cam.follow._x - SW / 2; cam.y = cam.follow._y - SH / 2; }
    }
    clampCamera();
    if (cam.shakeUntil > g.clock) { cam.sx = (Math.random() - 0.5) * 2 * cam.shakeAmp; cam.sy = (Math.random() - 0.5) * 2 * cam.shakeAmp; }
    else { cam.sx = 0; cam.sy = 0; }
  }

  function camX() { return Math.round(g.cam.x + g.cam.sx); }
  function camY() { return Math.round(g.cam.y + g.cam.sy); }

  // ---------------- 瓦片碰撞 ----------------

  function spriteHitsTile(s, x, y) {
    var tm = g.tilemap;
    if (!tm) return false;
    var hw = s._img.width / 2, hh = s._img.height / 2;
    var l = Math.floor((x - hw) / 16), r = Math.floor((x + hw - 0.01) / 16);
    var t = Math.floor((y - hh) / 16), b = Math.floor((y + hh - 0.01) / 16);
    for (var row = t; row <= b; row++)
      for (var col = l; col <= r; col++)
        if (tileIsSolid(tm.getTile(col, row))) return true;
    return false;
  }

  function stepAxis(s, dx, dy) {
    var n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
    if (n < 1) n = 1;
    var stepX = dx / n, stepY = dy / n;
    for (var i = 0; i < n; i++) {
      if (stepX && spriteHitsTile(s, s._x + stepX, s._y)) { onHitTile(s, stepX > 0 ? 2 : 1); return; }
      if (stepY && spriteHitsTile(s, s._x, s._y + stepY)) { onHitTile(s, stepY > 0 ? 4 : 3); return; }
      s._x += stepX;
      s._y += stepY;
    }
  }

  function onHitTile(s, dir) {
    // dir: 1=左 2=右 3=上 4=下
    s._hitWall = dir;
    if ((dir === 1 || dir === 2) && s._bounce) {
      s.vx = -s.vx * 0.5;
      return;
    }
    if (dir === 1 && s.vx < 0) s.vx = 0;
    else if (dir === 2 && s.vx > 0) s.vx = 0;
    else if (dir === 3 && s.vy < 0) s.vy = 0;
    else if (dir === 4 && s.vy > 0) s.vy = 0;
    fireList(s._onHitWall, [dir]);
  }

  // ---------------- 时间 / 数学 ----------------

  var pendingTimers = [];
  function setTimeoutShim(cb, ms) { pendingTimers.push({ cb: cb, due: nowMs() + ms }); return 0; }

  // pxt 的 pause() 是挂起当前"纤维"。这里没有协程，退化成：
  // 记下这次挂起时长，由重叠派发器把"同一对精灵"冷却这么久——
  // 这正是游戏里 pause 最常见的用途（避免同一次碰撞每帧重复触发）。
  var fiberCtx = null;
  function pause(ms) {
    if (fiberCtx && ms > 0 && ms > (fiberCtx.pauseMs || 0)) fiberCtx.pauseMs = ms;
  }
  function runParallel(fn) {
    // 没有真正的并发：立即执行
    try { fn(); } catch (e) { Host.warn("runInParallel: " + (e && e.message ? e.message : e)); }
  }

  function installGlobals(scope) {
    scope.Math.randomRange = function (a, b) {
      if (b === undefined) { b = a; a = 0; }
      return a + Math.floor(Math.random() * (b - a + 1));
    };
    scope.Math.randomBoolean = function () { return Math.random() < 0.5; };
    scope.Math.percentChance = function (p) { return Math.random() * 100 < p; };
    scope.Math.lerp = function (a, b, t) { return a + (b - a) * t; };
    scope.Math.clamp = function (a, lo, hi) { return clamp(a, lo, hi); };
    scope.Math.mod = function (a, b) { var r = a % b; return r < 0 ? r + b : r; };
    scope.Math.sign = function (a) { return a < 0 ? -1 : (a > 0 ? 1 : 0); };
    scope.Math.pickRandom = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
    scope.Math.randomBool = function () { return Math.random() < 0.5; };
    scope.randint = function (a, b) { return scope.Math.randomRange(a, b); };
    scope.randint = scope.randint;
    scope.pause = pause;
    scope.console = scope.console || {};
    scope.console.log = function (m) {
      var t = String(m);
      g.logLines.push(t);
      if (g.logLines.length > 32) g.logLines.shift();
      Host.log("log", t);
    };
    scope.console.warn = function (m) { Host.warn(String(m)); };
  }

  // ---------------- 运行时主体 ----------------

  function Runtime(options) {
    options = options || {};
    for (var k in options) if (options.hasOwnProperty(k)) Host[k] = options[k];
    this.frame = 0;
    this.accum = 0;
    this.lastNow = 0;
  }

  Runtime.prototype.getScope = function () {
    var scope = {
      // 绘图
      img: imageFromText,
      image: {
        create: function (w, h) { return new Image(w, h); },
        ofRows: function () { return new Image(1, 1); },
        getFont: function () { return new Image(3, 5); },
        createImage: function (w, h) { return new Image(w, h); },
        ofBuffer: function (buf) { return imageFromBuffer(buf, 16, 16); },
        fromBuffer: function (buf) { return imageFromBuffer(buf, 16, 16); },
        setPalette: function (p) { applyPalette(p); },
        getPalette: function () { return PALETTE.map(function (c) { return [c[0], c[1], c[2]]; }); }
      },
      Image: Image,
      assets: assets,
      helpers: helpers,
      tiles: nsStubs(tiles, "tiles"),
      tilemap: tilemapTag,
      hex: hex,
      TileScale: TileScale,
      CollisionDirection: CollisionDirection,
      DialogLayout: DialogLayout,
      ScreenImage: Image,
      sprites: nsStubs(sprites, "sprites"),
      Sprite: Sprite,
      SpriteKind: SpriteKind,
      SpriteFlag: SpriteFlag,
      scene: nsStubs(scene, "scene"),
      screen: nsStubs(screen, "screen"),
      game: nsStubs(game, "game"),
      info: nsStubs(info, "info"),
      controller: nsStubs(controller, "controller"),
      ControllerButtonEvent: ControllerButtonEvent,
      animation: nsStubs(animation, "animation"),
      ActionKind: ActionKind,
      Animation: function () { },
      effects: effects,
      music: nsStubs(music, "music"),
      BeatFraction: BeatFraction,
      settings: nsStubs({}, "settings"),
      statusbars: nsStubs({}, "statusbars"),
      control: nsStubs({
        millis: function () { return g.clock; },
        runtime: function () { return g.clock; },
        wait: function () { },
        runInParallel: runParallel,
        runInBackground: runParallel,
        reset: function () { }
      }, "control"),
      Math: Math
    };
    installGlobals(scope);
    return scope;
  };

  /*
   * 把整个运行时恢复到"刚上电"的状态。
   * 必须在 load 之前调用：controller / info 这些是模块级单例，
   * 新的 Runtime 实例并不会把它们重建；不清理的话，reset 之后
   * onEvent 注册的处理器会在旧数组上继续叠加，按一次键触发多次。
   */
  function resetRuntimeState() {
    g.sprites.length = 0;
    g.movers.length = 0;
    g.sysMenu.open = false;
    g.sysMenu.index = 0;
    g.sysMenu.active = false;
    g.showStats = false;
    g.showConsole = false;
    g.logLines.length = 0;
    g.nextZ = 1;
    g.bgColor = 0;
    g.bgImage = null;
    g.updateHandlers.length = 0;
    g.paintHandlers.length = 0;
    g.intervalHandlers.length = 0;
    g.overlapHandlers.length = 0;
    g.shadeHandlers.length = 0;
    g.textLayer.length = 0;
    g.buttonHandlers.length = 0;
    g.overlapCooldown = {};
    g.btnRepeat = {};
    g.repeatDelay = 500;
    g.repeatInterval = 100;
    g.buttonsDown = {};
    g.anyPressed = false;
    g.started = false;
    g.gameOver = false;
    g.score = 0;
    g.life = 0;
    g.clock = 0;

    // 按钮处理器（模块级单例，必须显式清）
    var names = ["left", "right", "up", "down", "A", "B", "menu"];
    for (var i = 0; i < names.length; i++) {
      var b = controller[names[i]];
      if (b) b._fns = {};
    }
    if (controller.anyButton) controller.anyButton._fns = {};

    // 每个玩家独立的分数 / 生命 / 计分牌
    var players = [info.player1, info.player2];
    for (var k = 0; k < players.length; k++) {
      var pi = players[k];
      if (!pi) continue;
      pi._score = 0;
      pi._lives = 0;
      pi._shown = false;
    }

    g.tilemap = null;
    g.tileOverlapHandlers.length = 0;
    g.wallHandlers.length = 0;
    g.factories = {};
    g.cam.follow = null;
    g.cam.x = 0; g.cam.y = 0;
    g.cam.shakeUntil = 0; g.cam.shakeAmp = 0; g.cam.sx = 0; g.cam.sy = 0;
    g.splashPauseUntil = 0;
    g.ccTiles = {};
    g.ccMap = null;
    g.melody = null;
    Dialog.queue.length = 0;
    Dialog.current = null;
    Dialog.splashUntil = 0;

    pendingTimers.length = 0;
    fiberCtx = null;
    Graphics.particles.length = 0;
    Graphics.screenEffect = null;
    if (Graphics.screen) Graphics.screen.fill(0);
  }

  /*
   * 把工程里的 .ts 源码拼成一份可执行程序。
   *
   * 关键点：pxt 编译的是"整个工程"，不是只有 main.ts。生成文件（images.g.ts /
   * tilemap.g.ts）里塞满了类型壳子和 helpers._registerFactory 调用，直接执行会
   * 撞上一堆未定义标识符；它们的真实内容都在同名 .jres 里，所以这里跳过 .g.ts，
   * 只跑手写代码，资源另走 Assets 注册表。
   */
  function compileProjectFiles(files) {
    var names = [];
    for (var k in files) {
      if (!files.hasOwnProperty(k)) continue;
      if (/\.ts$/i.test(k) && !/\.g\.ts$/i.test(k)) names.push(k);
    }
    names.sort(function (a, b) {
      if (a === "main.ts") return -1;
      if (b === "main.ts") return 1;
      return a < b ? -1 : (a > b ? 1 : 0);
    });
    var out = [];
    for (var i = 0; i < names.length; i++)
      out.push("/* ===== " + names[i] + " ===== */\n" + TsStrip.tsToJs(files[names[i]]));
    if (!names.length) throw new Error("工程里没有可执行的 .ts 文件");
    return out.join("\n;\n");
  }

  /*
   * boot(source)：source 可能是
   *   - 整个工程的文件表 JSON（{"main.ts": "...", "tilemap.g.jres": "..."}）
   *   - 单个 main.ts 源码（老式卡带 / 手工测试）
   */
  Runtime.prototype.boot = function (sourceText) {
    var text = String(sourceText == null ? "" : sourceText);
    var files = null;
    var head = text.replace(/^\s+/, "").charAt(0);
    if (head === "{") {
      try { files = JSON.parse(text); } catch (e) { files = null; }
    }
    var js;
    if (files && typeof files === "object") {
      loadProjectAssets(files);
      js = compileProjectFiles(files);
    } else {
      Assets.reset();
      js = TsStrip.tsToJs(text);
    }
    this.files = files;
    this.load(js);
    return js;
  };

  /*
   * 卡带里只有"用户文件"，第三方扩展（github:xxx 之类）的代码不在 PNG 里。
   * 于是 `gamejam.register(...)` 这种一上来就 ReferenceError，整局加载失败。
   * 这里把"被当作对象/函数用、但既没声明也不在作用域里"的名字兜成 stub：
   * 扩展逻辑依然不会真的生效（代码根本没有），但至少能进游戏、并且报一条明确的告警。
   */
  var JS_BUILTINS = {
    Math: 1, JSON: 1, Object: 1, Array: 1, String: 1, Number: 1, Boolean: 1, RegExp: 1,
    Date: 1, Error: 1, TypeError: 1, RangeError: 1, Promise: 1, Symbol: 1, Map: 1, Set: 1,
    WeakMap: 1, WeakSet: 1, Reflect: 1, Proxy: 1, Function: 1, parseInt: 1, parseFloat: 1,
    isNaN: 1, isFinite: 1, encodeURIComponent: 1, decodeURIComponent: 1, NaN: 1,
    Infinity: 1, undefined: 1, globalThis: 1, arguments: 1, console: 1
  };
  var JS_KEYWORDS = {
    if: 1, for: 1, while: 1, switch: 1, catch: 1, return: 1, typeof: 1, function: 1,
    new: 1, delete: 1, void: 1, in: 1, of: 1, instanceof: 1, do: 1, else: 1, case: 1,
    with: 1, yield: 1, await: 1, this: 1, var: 1, let: 1, const: 1, class: 1, super: 1
  };

  function stubUnknownGlobals(jsSource, scope) {
    var declared = {}, m;
    var reDecl = /\b(?:var|let|const|function|class)\s+([A-Za-z_$][\w$]*)/g;
    while ((m = reDecl.exec(jsSource))) declared[m[1]] = 1;
    // 转译器把 namespace 的空对象初始化提到文件头了，先让这些名字在作用域里有个对象，
    // 否则 `_crossroad.main` 这类"注册时取成员"的写法会被当成未定义符号。
    var reNsHead = /^([A-Za-z_$][\w$]*)\s*=\s*\(typeof/gm;
    while ((m = reNsHead.exec(jsSource))) {
      declared[m[1]] = 1;
      if (scope[m[1]] === undefined) scope[m[1]] = {};
    }
    var added = 0;
    var reUse = /([A-Za-z_$][\w$]*)\s*[.(]/g;
    while ((m = reUse.exec(jsSource))) {
      var name = m[1];
      if (m.index > 0 && jsSource.charAt(m.index - 1) === ".") continue;   // 属性访问
      if (declared[name] || scope[name] !== undefined) continue;
      if (JS_BUILTINS[name] || JS_KEYWORDS[name]) continue;
      declared[name] = 1;                       // 同一个名字只建一次
      scope[name] = stub(null, name);
      added++;
      if (added > 200) break;                   // 扫描异常时别把作用域撑爆
    }
    return added;
  }

  Runtime.prototype.load = function (jsSource) {
    var scope = this.getScope();
    // 生成代码里的 myTiles / myImages 命名空间：直接从 .jres 建好塞进作用域，
    // 这样手写的 main.ts 里 myImages.image1 这种引用也能解析。
    for (var nsName in Assets.namespaces)
      if (Assets.namespaces.hasOwnProperty(nsName)) scope[nsName] = Assets.namespaces[nsName];
    var stubbed = stubUnknownGlobals(jsSource, scope);
    if (stubbed) Host.warn("有 " + stubbed + " 个名字未定义（多半是第三方扩展，卡带里不含其代码），已按空操作处理");
    var names = Object.keys(scope);
    var body = "";
    for (var i = 0; i < names.length; i++) body += "var " + names[i] + " = __scope[" + JSON.stringify(names[i]) + "];\n";
    body += "with (__scope) {\n" + jsSource + "\n}";
    var fn = new Function("__scope", body);
    this.scope = scope;
    this._src = jsSource;
    activeRuntime = this;
    resetRuntimeState();
    try {
      fn(scope);
      this.booted = true;
    } catch (e) {
      this.bootError = e && e.message ? e.message : String(e);
      Host.warn("load failed: " + this.bootError + (e && e.stack ? " | " + e.stack : ""));
      throw e;
    }
  };

  Runtime.prototype.setButton = function (name, down) {
    // 系统菜单打开时暂停游戏、独占输入。
    // 方向语义照真机：左右 ±1 格，上下 ±1 行（4 格），到边就停，不绕回。
    if (g.sysMenu.open) {
      var items = systemMenuItems();
      var n = items.length, sel = g.sysMenu.index | 0;
      if (name === "menu" || name === "B") { if (down) closeSystemMenu(); return; }
      if (name === "A") {
        if (down) { g.sysMenu.active = true; return; }
        g.sysMenu.active = false;
        if (items[sel] && items[sel].act) items[sel].act();
        return;
      }
      if (!down) return;
      if (name === "up") g.sysMenu.index = Math.max(0, sel - MENU_PER_ROW);
      else if (name === "down") g.sysMenu.index = Math.min(n - 1, sel + MENU_PER_ROW);
      else if (name === "left") g.sysMenu.index = Math.max(0, sel - 1);
      else if (name === "right") g.sysMenu.index = Math.min(n - 1, sel + 1);
      return;
    }
    if (name === "A" && down && Dialog.isOpen()) { Dialog.advance(); return; }

    // MENU 键：游戏自己注册了 onEvent 就转发给它，否则打开系统菜单
    if (name === "menu" && down) {
      var mh = controller.menu._fns[ControllerButtonEvent.Pressed];
      if (!mh || !mh.length) { openSystemMenu(); return; }
    }

    var was = !!g.buttonsDown[name];
    g.buttonsDown[name] = !!down;
    if (was === !!down) return;
    g.btnRepeat[name] = { next: g.clock + g.repeatDelay };
    var ev = down ? ControllerButtonEvent.Pressed : ControllerButtonEvent.Released;
    var btn = controller[name];
    if (btn) fireList(btn._fns[ev], []);
    if (name === "A" || name === "B" || name === "menu") { }
    var anyEv = down ? 1 : 2;
    fireList(controller.anyButton._fns[anyEv], []);
    g.anyPressed = !!(g.buttonsDown.A || g.buttonsDown.B || g.buttonsDown.left ||
      g.buttonsDown.right || g.buttonsDown.up || g.buttonsDown.down || g.buttonsDown.menu);
  };

  Runtime.prototype.tick = function (dtMs) {
    var dt = dtMs / 1000;
    g.clock += dtMs;
    var i, s;

    // FPS 统计（菜单里的 SHOW STATS 用）
    g._frames++;
    if (g.clock - g._fpsAt >= 500) {
      g.fps = Math.round(g._frames * 1000 / (g.clock - g._fpsAt));
      g._frames = 0;
      g._fpsAt = g.clock;
    }

    // 系统菜单里暂停：时间照走，但游戏逻辑和物理全停
    if (g.sysMenu.open) return;

    // 对话框 / splash 期间同样暂停游戏（真机是挂起游戏纤维）
    if (Dialog.isBlocking()) { Graphics.updateEffects(dt); return; }

    // 按住键的重复事件（controller.setRepeatDefault(delay, interval)）
    // 语义和真机一致：delay 是"第一次重复之前等多久"，interval 是之后每次的间隔。
    // 这里必须把 delay 和 interval 分开算——ping 设的是 (0, 1000)，
    // 用 interval 去等第一次重复的话要等满 1 秒才触发，游戏里的"玩家接管"逻辑就迟到了。
    for (var bn in g.buttonsDown) {
      if (!g.buttonsDown[bn]) continue;
      var rs = g.btnRepeat[bn];
      if (!rs) continue;
      var guard = 0;
      while (g.clock >= rs.next && guard++ < 32) {
        rs.next += g.repeatInterval;
        var rbtn = controller[bn];
        if (rbtn) fireList(rbtn._fns[ControllerButtonEvent.Repeated], []);
      }
    }

    // 真机行为：game.over() 之后游戏循环停住，只留画面和提示
    if (g.gameOver) {
      Graphics.updateEffects(dt);
      for (i = 0; i < pendingTimers.length; i++) {
        if (pendingTimers[i].due <= g.clock) { var tt = pendingTimers.splice(i, 1)[0]; tt.cb(); i--; }
      }
      return;
    }

    // 定时器
    for (i = 0; i < pendingTimers.length; i++) {
      if (pendingTimers[i].due <= g.clock) { var t = pendingTimers.splice(i, 1)[0]; t.cb(); i--; }
    }
    // onUpdateInterval
    for (i = 0; i < g.intervalHandlers.length; i++) {
      var h = g.intervalHandlers[i];
      if (h.ms <= 0) continue;
      while (g.clock - h.last >= h.ms) {
        h.last += h.ms;
        fireList([h.cb], []);
      }
    }
    // controller.moveSprite 登记的 mover：每帧按当前按键重算速度。
    // 必须排在游戏自己的 onUpdate 前面——这样手写 AI（比如 ping 的 trackBall）
    // 在自己 onUpdate 里改 sprite.vy 时仍然能覆盖它，两边不会打架。
    for (i = g.movers.length - 1; i >= 0; i--) {
      var mv = g.movers[i];
      if (!mv.sprite || !mv.sprite._alive) { g.movers.splice(i, 1); continue; }
      var mdx = (mv.pc.right.isPressed() ? 1 : 0) - (mv.pc.left.isPressed() ? 1 : 0);
      var mdy = (mv.pc.down.isPressed() ? 1 : 0) - (mv.pc.up.isPressed() ? 1 : 0);
      // 只接管"配置了速度"的那个轴。平台游戏是 moveSprite(玩家, 100, 0) +
      // 重力，如果把 vy 也按 0 写回，重力每帧就被抹掉，主角会匀速下坠。
      if (mv.vx) mv.sprite.vx = mdx * mv.vx;
      if (mv.vy) mv.sprite.vy = mdy * mv.vy;
    }

    updateMelody();

    // onUpdate
    fireList(g.updateHandlers, []);

    // 物理
    for (i = 0; i < g.sprites.length; i++) {
      s = g.sprites[i];
      if (!s._alive) continue;
      s.vx += s.ax * dt;
      s.vy += s.ay * dt;
      if (g.tilemap && !(s.flags & SpriteFlag.Ghost)) {
        // 有图块地图时按轴向逐像素推进，撞到实心格就贴着停下（平台游戏的基础）
        stepAxis(s, s.vx * dt, 0);
        stepAxis(s, 0, s.vy * dt);
      } else {
        s._x += s.vx * dt;
        s._y += s.vy * dt;
      }
      if (s.flags & SpriteFlag.StayInScreen) {
        var half = s._img.width / 2, halfh = s._img.height / 2;
        // pxt 的 StayInScreen 是"别跑出摄像机视野"，不是"别跑出 160x120 的屏幕"。
        // 用绝对屏幕坐标会把大地图上的角色一路拽回原点（cube land 的角色就是这样卡死的）。
        var vx0 = g.cam.x, vy0 = g.cam.y;
        if (s._x < vx0 + half) { s._x = vx0 + half; if (s.vx < 0) s.vx = -s.vx; }
        if (s._x > vx0 + SW - half) { s._x = vx0 + SW - half; if (s.vx > 0) s.vx = -s.vx; }
        if (s._y < vy0 + halfh) { s._y = vy0 + halfh; if (s.vy < 0) s.vy = -s.vy; }
        if (s._y > vy0 + SH - halfh) { s._y = vy0 + SH - halfh; if (s.vy > 0) s.vy = -s.vy; }
      }
      // 撞墙事件（scene.onHitWall / sprite.onHitWall）
      if (s._hitWall) {
        var wdir = s._hitWall;
        s._hitWall = 0;
        // 只在"刚贴上墙"的那一帧回调：一直推着墙不该每帧都触发
        if (s._wallDir !== wdir) {
          fireList(s._onHitWall, [wdir]);
          for (var wi = 0; wi < g.wallHandlers.length; wi++) {
            if (g.wallHandlers[wi].kind !== s.kind) continue;
            try { g.wallHandlers[wi].cb(s, wdir); }
            catch (e) { Host.warn("onHitWall: " + (e && e.message ? e.message : e)); }
          }
        }
        s._wallDir = wdir;
      } else {
        s._wallDir = 0;
      }
      updateSpriteAnim(s);
      if (s.lifespan > 0) {
        s._age += dtMs;
        if (s._age >= s.lifespan) s.destroy();
      }
    }

    // 重叠检测
    for (i = 0; i < g.overlapHandlers.length; i++) {
      var oh = g.overlapHandlers[i];
      var as = [], bs = [];
      for (var j = 0; j < g.sprites.length; j++) {
        var sp = g.sprites[j];
        if (!sp._alive) continue;
        if (sp.kind === oh.k1) as.push(sp);
        else if (sp.kind === oh.k2) bs.push(sp);
      }
      for (var a = 0; a < as.length; a++)
        for (var b = 0; b < bs.length; b++) {
          if (!Graphics.overlap(as[a], bs[b])) continue;
          var pairKey = i + ":" + as[a]._id + ":" + bs[b]._id;
          if ((g.overlapCooldown[pairKey] || 0) > g.clock) continue;
          var ctx = { pauseMs: 0 };
          fiberCtx = ctx;
          try { oh.cb(as[a], bs[b]); } catch (e) { Host.warn("overlap: " + e.message); }
          fiberCtx = null;
          // handler 里调过 pause(ms) → 这一对精灵冷却 ms，等价于"这个纤维被挂起"
          if (ctx.pauseMs > 0) g.overlapCooldown[pairKey] = g.clock + ctx.pauseMs;
        }
    }

    // 图块重叠：scene.onOverlapTile(玩家, 某图块, cb) —— 平台游戏靠它做"碰到旗子过关"
    for (i = 0; i < g.tileOverlapHandlers.length; i++) {
      var th = g.tileOverlapHandlers[i];
      var tmNow = g.tilemap;
      if (!tmNow || !th.tile) continue;
      for (var si = 0; si < g.sprites.length; si++) {
        var ss = g.sprites[si];
        if (!ss._alive || ss.kind !== th.kind) continue;
        var shw = ss._img.width / 2, shh = ss._img.height / 2;
        // 注意这里是"包含边界"的重叠判定（pxt 用的是 >> 4，贴边就算碰上）：
        // 平台游戏里"碰到旗子过关"就是靠精灵被挡在格子边缘那一刻触发的。
        var sc0 = Math.floor((ss._x - shw) / 16), sc1 = Math.floor((ss._x + shw) / 16);
        var sr0 = Math.floor((ss._y - shh) / 16), sr1 = Math.floor((ss._y + shh) / 16);
        for (var srow = sr0; srow <= sr1; srow++) {
          for (var scol = sc0; scol <= sc1; scol++) {
            if (tmNow.getTile(scol, srow) !== th.tile) continue;
            try { th.cb(ss, new Location(scol * 16, srow * 16)); }
            catch (e) { Host.warn("onOverlapTile: " + (e && e.message ? e.message : e)); }
            // 回调里可能换了整张地图（过关），此时后面的格子已经没有意义
            if (g.tilemap !== tmNow) { srow = sr1 + 1; break; }
          }
        }
      }
    }

    // onPaint
    fireList(g.paintHandlers, []);

    // 回收
    for (i = g.sprites.length - 1; i >= 0; i--) if (!g.sprites[i]._alive) g.sprites.splice(i, 1);

    updateCamera();
    Graphics.updateEffects(dt);
  };

  Runtime.prototype.render = function () {
    Graphics.clear(g.bgColor);
    if (g.bgImage) {
      for (var y = 0; y < g.bgImage.height && y < SH; y++)
        for (var x = 0; x < g.bgImage.width && x < SW; x++) {
          var c = g.bgImage.data[y * g.bgImage.width + x];
          if (c) Graphics.screen.data[y * SW + x] = c;
        }
    }
    var list = g.sprites.slice().sort(function (a, b) { return (a.z | 0) - (b.z | 0); });
    // 图块地图画在精灵下面
    if (g.tilemap) {
      var cx = camX(), cy = camY(), tm = g.tilemap;
      var c0 = Math.max(0, cx >> 4), r0 = Math.max(0, cy >> 4);
      var c1 = Math.min(tm.width - 1, (cx + SW) >> 4), r1 = Math.min(tm.height - 1, (cy + SH) >> 4);
      for (var row = r0; row <= r1; row++)
        for (var col = c0; col <= c1; col++) {
          var tl = tm.getTile(col, row);
          if (!tl) continue;
          Graphics.screen.blit(tl, col * 16 - cx, row * 16 - cy);
        }
    }
    for (var i = 0; i < list.length; i++) Graphics.drawSprite(list[i]);
    Graphics.drawEffects();
    if (Graphics.drawCenterText) {
      var t = Graphics.drawCenterText;
      drawText(Graphics.screen, t, (SW - t.length * 4) / 2, SH / 2, 2);
    }
    // 玩家计分牌：调用过 setScore 才出现，左上/右上
    drawScoreBadge(info.player1, false);
    drawScoreBadge(info.player2, true);
    // onShade：玩家叠在最上层的 HUD / 文字
    for (var h = 0; h < g.shadeHandlers.length; h++) {
      try { g.shadeHandlers[h](); }
      catch (e) { Host.warn("onShade: " + (e && e.message ? e.message : e)); }
    }
    Dialog.draw();
    if (g.showConsole) drawConsoleOverlay();
    if (g.showStats) drawStatsOverlay();
    if (g.sysMenu.open) drawSystemMenu();
  };

  // 输出 RGBA
  Runtime.prototype.toRGBA = function (out) {
    out = out || new Uint8Array(SW * SH * 4);
    var d = Graphics.screen.data;
    for (var i = 0, o = 0; i < d.length; i++, o += 4) {
      var p = PALETTE[d[i]];
      out[o] = p[0]; out[o + 1] = p[1]; out[o + 2] = p[2]; out[o + 3] = 255;
    }
    return out;
  };

  return {
    Runtime: Runtime,
    Image: Image,
    PALETTE: PALETTE,
    SCREEN_W: SW,
    SCREEN_H: SH,
    imageFromText: imageFromText,
    _assets: function () { return Assets; },
    _debug: function () {
      return {
        sprites: g.sprites,
        score: g.score,
        over: g.gameOver,
        sysMenu: g.sysMenu,
        volume: g.volume,
        showStats: g.showStats,
        showConsole: g.showConsole,
        logLines: g.logLines.length,
        fps: g.fps,
        clock: g.clock,
        cam: g.cam,
        movers: g.movers.map(function (m) { return { id: m.sprite._id, vx: m.vx, vy: m.vy }; }),
        tilemap: g.tilemap,
        dialog: { open: Dialog.isOpen(), queued: Dialog.queue.length },
        assets: {
          image: Object.keys(Assets.image).length,
          tile: Object.keys(Assets.tile).length,
          tilemap: Object.keys(Assets.tilemap).length
        },
        handlers: {
          update: g.updateHandlers.length,
          interval: g.intervalHandlers.length,
          overlap: g.overlapHandlers.length
        }
      };
    }
  };
});
