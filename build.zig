const std = @import("std");

// ============================================================================
// MakeCode Arcade libretro core —— Zig 构建脚本
//
//   zig build                                本机平台核心 → zig-out/lib/
//   zig build test                           自检（卡带解析 + ping 90 帧）
//   zig build tools                          编自检程序 → zig-out/bin/
//   zig build -Dtarget=aarch64-linux-gnu     交叉编译（任意 Zig 支持的 triple）
//   zig build release                        出全部发布目标 → zig-out/lib/
//   zig build release -Dndk=<NDK 根目录>      连 Android 一起出
//
// 本核心是 C 项目（core.c / cart.c + QuickJS + miniz + LZMA）；build.zig 负责
// 「按目标平台编译 C + 生成 pxt_bundle.h + 装成 libretro 规范的文件名」。
// ============================================================================

const CORE_C = &.{ "src/core.c", "src/cart.c", "src/decompress.c", "src/compiler.c" };

const CORE_TEST_C = &.{ "tests/core_test.c", "src/core.c", "src/cart.c", "src/decompress.c", "src/compiler.c" };

const BTN_TEST_C = &.{ "tests/btn_test.c", "src/core.c", "src/cart.c", "src/decompress.c", "src/compiler.c" };

const QUICKJS_C = &.{
    "third_party/quickjs/quickjs.c",
    "third_party/quickjs/dtoa.c",
    "third_party/quickjs/libregexp.c",
    "third_party/quickjs/libunicode.c",
};

/// PNG 卡带解码（v0.9 直接用 .js，但 cart.c 仍被自检与工具复用）
const DECODER_C = &.{
    "third_party/miniz/miniz_tinfl.c",
    "third_party/lzma/LzmaDec.c",
};

const CFLAGS = &.{
    "-std=gnu99",
    "-fno-strict-aliasing",
    "-Wall",
    "-Wextra",
    "-Wno-unused-parameter",
    "-Wno-typedef-redefinition",
};

const QUICKJS_CFLAGS = &.{
    "-std=gnu99",
    "-fno-strict-aliasing",
    "-Wno-unused-but-set-variable",
    "-Wno-sign-compare",
    "-Wno-unused-parameter",
};

const ReleaseSpec = struct {
    /// 传给 Zig 的 target triple
    triple: []const u8,
    /// 装到 zig-out/lib 下的文件名（RetroArch 只认 arcade_libretro.<ext>）
    out_name: []const u8,
    /// Android 目标需要 NDK（-Dndk=...），没给就跳过
    needs_ndk: bool = false,
};

const RELEASE_TARGETS = [_]ReleaseSpec{
    .{ .triple = "x86_64-windows-gnu", .out_name = "arcade_libretro.dll" },
    .{ .triple = "x86_64-linux-gnu", .out_name = "arcade_libretro.so" },
    .{ .triple = "aarch64-linux-gnu", .out_name = "arcade_libretro_aarch64.so" },
    .{ .triple = "aarch64-linux-android", .out_name = "arcade_libretro_android.so", .needs_ndk = true },
};

const Ndk = struct {
    root: []const u8,
    api: []const u8,
};

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    // 默认 ReleaseFast：核心是给玩家跑的，Debug 会慢 5～10 倍
    const optimize = b.option(std.builtin.Optimize, "optimize", "优化级别：Debug / ReleaseSafe / ReleaseFast / ReleaseSmall（默认 ReleaseFast）") orelse std.builtin.Optimize.ReleaseFast;
    const python = b.option([]const u8, "python", "Python 3 可执行文件") orelse defaultPython();
    const strip = b.option(bool, "strip", "剥离调试符号（默认 true，发布体积 7.7MB → 2.4MB）") orelse true;

    const ndk: ?Ndk = if (b.option([]const u8, "ndk", "Android NDK 根目录（编 Android 目标时需要）")) |root| .{
        .root = root,
        .api = b.option([]const u8, "android-api", "Android API level（默认 21）") orelse "21",
    } else null;

    // ---- 1. 生成 pxt_bundle.h（runtime/*.js + 官方 sim 三层）----
    const bundle_dir = genBundle(b, python);

    // 内嵌编译器（png 卡带当场编译成 binary.js）默认打开：这是核心的主打功能。
    // 关掉（-Dincart_compiler=false）能出 2MB 左右的瘦核心，只认现成的 .js。
    const incart_compiler = b.option(bool, "incart_compiler", "内嵌 pxt 编译器，支持直接加载 .png 卡带（默认 true，关掉体积小一半）") orelse true;
    const pxtbuild = b.option([]const u8, "pxtbuild", "pxtc 环境目录（node tools/setup_pxtc.js 装的那个，默认 %TEMP%/pxtbuild）");

    // ---- 2. 生成 pxt_compiler_bundle.h（只在需要内嵌编译器时）----
    const compiler_dir: ?std.Build.LazyPath = if (incart_compiler)
        genCompilerBundle(b, python, pxtbuild)
    else
        null;

    // ---- 3. 本机核心 ----
    const core = addCore(b, target, optimize, bundle_dir, compiler_dir, ndk, strip);
    const core_inst = b.addInstallArtifact(core, .{
        .dest_dir = .{ .override = .lib },
        .dest_sub_path = coreFileName(target.result),
    });
    b.getInstallStep().dependOn(&core_inst.step);

    // .info 一起装到 zig-out/info/（RetroArch 要求 core 与 .info 同名前缀且分放两目录）
    const info_inst = b.addInstallFileWithDir(b.path("dist/arcade_libretro.info"), .{ .custom = "info" }, "arcade_libretro.info");
    b.getInstallStep().dependOn(&info_inst.step);

    // ---- 3. 自检程序 ----
    const cart_test = addCartTest(b, target, optimize);
    const core_test = addCoreTest(b, target, optimize, bundle_dir, compiler_dir);
    const btn_test = addBtnTest(b, target, optimize, bundle_dir, compiler_dir);

    const tools_step = b.step("tools", "编译自检程序（cart_test / core_test / btn_test）");
    for ([_]*std.Build.Step.Compile{ cart_test, core_test, btn_test }) |exe| {
        const inst = b.addInstallArtifact(exe, .{});
        tools_step.dependOn(&inst.step);
    }

    const test_step = b.step("test", "自检：PNG 卡带解析 + tests/data/ping.js 跑 90 帧");
    for ([_][]const u8{
        "tests/data/sample_arcade.png",
        "tests/data/sample_arcade_lzma.png",
        "tests/data/big.png",
        "tests/data/tileprobe.png",
    }) |cart| {
        const run = b.addRunArtifact(cart_test);
        run.addArg(cart);
        _ = run.addOutputFileArg("out.ts");
        test_step.dependOn(&run.step);
    }
    {
        const run = b.addRunArtifact(core_test);
        run.addArg("tests/data/ping.js");
        _ = run.addOutputFileArg("out.ppm");
        run.addArg("90");
        test_step.dependOn(&run.step);
    }
    // 端到端：png 卡带当场编译成 binary.js 再跑 90 帧（内嵌编译器那条路）。
    // --stack=1024 把整套流程放到 1MB 栈的线程里跑——RetroArch 主线程就是这个量级，
    // 我们自己编的 exe 有 16MB，不加这个参数就测不出"编译递归踩穿宿主栈"。
    if (incart_compiler) {
        const run = b.addRunArtifact(core_test);
        run.addArg("tests/data/ping.png");
        _ = run.addOutputFileArg("png.ppm");
        run.addArg("90");
        run.addArg("--stack=1024");
        test_step.dependOn(&run.step);
    }

    // ---- 4. 多平台发布：zig build release ----
    // 三个不需要 NDK 的目标
    const rel_step = b.step("release", "交叉编译发布目标（Windows / Linux x64 / aarch64）");
    for (RELEASE_TARGETS) |spec| {
        if (spec.needs_ndk) continue;
        const inst = installCore(b, spec, optimize, bundle_dir, compiler_dir, ndk, strip);
        rel_step.dependOn(&inst.step);
    }

    // Android 单独一步（要 NDK；release 也会带上它，前提是给了 -Dndk）
    const android_spec = RELEASE_TARGETS[RELEASE_TARGETS.len - 1];
    const android_step = b.step("android", "编 Android aarch64 核心（需要 -Dndk=<NDK 根目录>）");
    if (ndk != null) {
        const inst = installCore(b, android_spec, optimize, bundle_dir, compiler_dir, ndk, strip);
        android_step.dependOn(&inst.step);
        rel_step.dependOn(&inst.step);
    } else {
        const note = b.addSystemCommand(&.{ "python", "-c", "print('编 Android 需要 -Dndk=<NDK 根目录>，例如 -Dndk=../ndk/android-ndk-r27c')" });
        android_step.dependOn(&note.step);
    }
}

/// 建一个交叉编译的核心并装到 zig-out/lib/<out_name>
fn installCore(
    b: *std.Build,
    spec: ReleaseSpec,
    optimize: std.builtin.OptimizeMode,
    bundle_dir: std.Build.LazyPath,
    compiler_dir: ?std.Build.LazyPath,
    ndk: ?Ndk,
    strip: bool,
) *std.Build.Step.InstallArtifact {
    const q = std.Target.Query.parse(.{ .arch_os_abi = spec.triple }) catch |err| {
        std.debug.panic("无法解析 target '{s}': {s}", .{ spec.triple, @errorName(err) });
    };
    const lib = addCore(b, b.resolveTargetQuery(q), optimize, bundle_dir, compiler_dir, ndk, strip);
    return b.addInstallArtifact(lib, .{
        .dest_dir = .{ .override = .lib },
        .dest_sub_path = spec.out_name,
    });
}

fn defaultPython() []const u8 {
    return if (@import("builtin").os.tag == .windows) "python" else "python3";
}

/// 生成 pxt_bundle.h，返回它所在目录（供 #include "pxt_bundle.h"）
fn genBundle(b: *std.Build, python: []const u8) std.Build.LazyPath {
    const cmd = b.addSystemCommand(&.{ python, "scripts/gen_bundle.py", "--outdir" });
    const dir = cmd.addOutputDirectoryArg("gen");
    cmd.setCwd(b.path("."));
    return dir;
}

/// pxtc 环境目录：-Dpxtbuild 指定的优先，否则 $PXTBUILD / %TEMP%/pxtbuild
fn pxtBuildDir(b: *std.Build, override: ?[]const u8) []const u8 {
    if (override) |d| return b.dupe(d);

    if (b.graph.environ_map.get("PXTBUILD")) |v| return b.dupe(v);

    const tmp_keys = [_][]const u8{ "TEMP", "TMP", "TMPDIR" };
    for (tmp_keys) |k| {
        if (b.graph.environ_map.get(k)) |v| return b.pathJoin(&.{ v, "pxtbuild" });
    }
    @panic("找不到临时目录，用 -Dpxtbuild=<目录> 指定 pxtc 环境");
}

/// 生成 pxt_compiler_bundle.h（pxt 编译器载荷），返回它所在目录
fn genCompilerBundle(b: *std.Build, python: []const u8, pxtbuild: ?[]const u8) std.Build.LazyPath {
    const root = pxtBuildDir(b, pxtbuild);
    const cmd = b.addSystemCommand(&.{ python, "scripts/gen_compiler_bundle.py" });
    cmd.setCwd(b.path("."));
    cmd.addArg("--pxt-core");
    cmd.addArg(b.pathJoin(&.{ root, "node_modules", "pxt-core" }));
    cmd.addArg("--pxt-arcade");
    cmd.addArg(b.pathJoin(&.{ root, "node_modules", "pxt-arcade" }));
    cmd.addArg("--runtime");
    cmd.addFileArg(b.path("runtime/compiler.js"));
    cmd.addArg("--out");
    const hdr = cmd.addOutputFileArg("pxt_compiler_bundle.h");
    return hdr.dirname();
}

fn coreFileName(t: std.Target) []const u8 {
    return switch (t.os.tag) {
        .windows => "arcade_libretro.dll",
        .macos => "arcade_libretro.dylib",
        else => "arcade_libretro.so",
    };
}

fn androidArchDir(arch: std.Target.Cpu.Arch) []const u8 {
    return switch (arch) {
        .aarch64 => "aarch64-linux-android",
        .arm => "armv7a-linux-androideabi",
        .x86_64 => "x86_64-linux-android",
        .x86 => "i686-linux-android",
        else => @panic("Android 只支持 arm / aarch64 / x86 / x86_64"),
    };
}

fn prebuiltHost() []const u8 {
    return switch (@import("builtin").os.tag) {
        .windows => "windows-x86_64",
        .macos => "darwin-x86_64",
        else => "linux-x86_64",
    };
}

/// Android：Zig 不带 bionic libc，必须借 NDK 的 sysroot（头文件 + crt + libc.so stub）
fn applyNdk(b: *std.Build, mod: *std.Build.Module, target: std.Build.ResolvedTarget, ndk: Ndk) void {
    const sysroot = b.fmt("{s}/toolchains/llvm/prebuilt/{s}/sysroot", .{ ndk.root, prebuiltHost() });
    const arch = androidArchDir(target.result.cpu.arch);
    const libdir = b.fmt("{s}/usr/lib/{s}/{s}", .{ sysroot, arch, ndk.api });

    mod.addSystemIncludePath(.{ .cwd_relative = b.fmt("{s}/usr/include", .{sysroot}) });
    mod.addSystemIncludePath(.{ .cwd_relative = b.fmt("{s}/usr/include/{s}", .{ sysroot, arch }) });
    mod.addLibraryPath(.{ .cwd_relative = libdir });

    // 动态库的 crt 头尾（zig 不提供，NDK 里现成）
    mod.addObjectFile(.{ .cwd_relative = b.fmt("{s}/crtbegin_so.o", .{libdir}) });
    mod.addObjectFile(.{ .cwd_relative = b.fmt("{s}/crtend_so.o", .{libdir}) });

    // 不能写 linkSystemLibrary("c")：Zig 会把它当成"我来提供 libc"并报没有 android libc。
    // 直接把这几个 .so stub 当链接输入（记录成 DT_NEEDED libc.so/libdl.so/libm.so）。
    for ([_][]const u8{ "libc.so", "libdl.so", "libm.so" }) |name| {
        mod.addObjectFile(.{ .cwd_relative = b.fmt("{s}/{s}", .{ libdir, name }) });
    }
}

/// 公共 C 模块：编译选项 + 头文件路径 + 依赖库
fn baseModule(
    b: *std.Build,
    target: std.Build.ResolvedTarget,
    optimize: std.builtin.OptimizeMode,
    ndk: ?Ndk,
) *std.Build.Module {
    const is_android = target.result.abi == .android;
    const mod = b.createModule(.{
        .target = target,
        .optimize = optimize,
        // Android 的 libc 由 NDK 提供，不能让 zig 去找自己的 libc
        .link_libc = !is_android,
    });
    mod.addIncludePath(b.path("src"));
    mod.addIncludePath(b.path("third_party/quickjs"));
    mod.addIncludePath(b.path("third_party/miniz"));
    mod.addIncludePath(b.path("third_party/lzma"));
    mod.addIncludePath(b.path("third_party/libretro"));

    if (is_android) {
        const n = ndk orelse @panic("编 Android 目标需要 -Dndk=<NDK 根目录>");
        applyNdk(b, mod, target, n);
    } else if (target.result.os.tag != .windows) {
        mod.linkSystemLibrary("m", .{});
    }
    return mod;
}

/// 内嵌编译器开关：给了载荷目录就编进去，否则落成空实现（只认现成 .js）
fn addCompiler(mod: *std.Build.Module, compiler_dir: ?std.Build.LazyPath) void {
    if (compiler_dir) |d| {
        mod.addIncludePath(d);
    } else {
        mod.addCMacro("ARCADE_NO_INCART_COMPILER", "1");
    }
}

fn addCore(
    b: *std.Build,
    target: std.Build.ResolvedTarget,
    optimize: std.builtin.OptimizeMode,
    bundle_dir: std.Build.LazyPath,
    compiler_dir: ?std.Build.LazyPath,
    ndk: ?Ndk,
    strip: bool,
) *std.Build.Step.Compile {
    const mod = baseModule(b, target, optimize, ndk);
    mod.strip = strip;
    mod.addIncludePath(bundle_dir);
    addCompiler(mod, compiler_dir);
    mod.addCSourceFiles(.{ .files = CORE_C, .flags = CFLAGS });
    mod.addCSourceFiles(.{ .files = QUICKJS_C, .flags = QUICKJS_CFLAGS });
    mod.addCSourceFiles(.{ .files = DECODER_C, .flags = CFLAGS });

    return b.addLibrary(.{
        .name = "arcade_libretro",
        .linkage = .dynamic,
        .root_module = mod,
    });
}

fn addCartTest(
    b: *std.Build,
    target: std.Build.ResolvedTarget,
    optimize: std.builtin.OptimizeMode,
) *std.Build.Step.Compile {
    const mod = baseModule(b, target, optimize, null);
    mod.addCSourceFiles(.{ .files = &.{ "tests/cart_test.c", "src/cart.c", "src/decompress.c" }, .flags = CFLAGS });
    mod.addCSourceFiles(.{ .files = DECODER_C, .flags = CFLAGS });
    return b.addExecutable(.{ .name = "cart_test", .root_module = mod });
}

fn addCoreTest(
    b: *std.Build,
    target: std.Build.ResolvedTarget,
    optimize: std.builtin.OptimizeMode,
    bundle_dir: std.Build.LazyPath,
    compiler_dir: ?std.Build.LazyPath,
) *std.Build.Step.Compile {
    const mod = baseModule(b, target, optimize, null);
    mod.addIncludePath(bundle_dir);
    addCompiler(mod, compiler_dir);
    mod.addCSourceFiles(.{ .files = CORE_TEST_C, .flags = CFLAGS });
    mod.addCSourceFiles(.{ .files = QUICKJS_C, .flags = QUICKJS_CFLAGS });
    mod.addCSourceFiles(.{ .files = DECODER_C, .flags = CFLAGS });
    return b.addExecutable(.{ .name = "core_test", .root_module = mod });
}

fn addBtnTest(
    b: *std.Build,
    target: std.Build.ResolvedTarget,
    optimize: std.builtin.OptimizeMode,
    bundle_dir: std.Build.LazyPath,
    compiler_dir: ?std.Build.LazyPath,
) *std.Build.Step.Compile {
    const mod = baseModule(b, target, optimize, null);
    mod.addIncludePath(bundle_dir);
    addCompiler(mod, compiler_dir);
    mod.addCSourceFiles(.{ .files = BTN_TEST_C, .flags = CFLAGS });
    mod.addCSourceFiles(.{ .files = QUICKJS_C, .flags = QUICKJS_CFLAGS });
    mod.addCSourceFiles(.{ .files = DECODER_C, .flags = CFLAGS });
    return b.addExecutable(.{ .name = "btn_test", .root_module = mod });
}
