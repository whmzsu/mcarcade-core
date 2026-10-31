#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dll_smoke.py —— 用 ctypes 当假前端，直接驱动 arcade_libretro.dll 跑一张卡带。

为什么要这个：静态链接的 core_test.exe 不能证明 DLL 也没问题——
Windows 上 exe 的栈是 16MB（zig 默认），而 RetroArch 给主线程只有 1MB。
这个脚本在 1MB 栈的线程里加载 DLL、调 retro_*，把真机条件复现出来。

    python tools/dev/dll_smoke.py zig-out/lib/arcade_libretro.dll 游戏.png [帧数]

退出码 0 = 编译 + 启动 + 跑帧全程没崩。
"""
import ctypes
import sys
import threading

RETRO_PIXEL_FORMAT_XRGB8888 = 1


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    dll_path, cart_path = argv[1], argv[2]
    frames = int(argv[3]) if len(argv) > 3 else 60

    data = open(cart_path, "rb").read()
    result = {"rc": 1, "frames": 0, "pixels": 0}

    def body():
        lib = ctypes.CDLL(dll_path)

        ENV = ctypes.CFUNCTYPE(ctypes.c_bool, ctypes.c_uint, ctypes.c_void_p)
        VIDEO = ctypes.CFUNCTYPE(None, ctypes.c_void_p, ctypes.c_uint, ctypes.c_uint, ctypes.c_size_t)
        AUDIO = ctypes.CFUNCTYPE(None, ctypes.c_int16, ctypes.c_int16)
        BATCH = ctypes.CFUNCTYPE(ctypes.c_size_t, ctypes.c_void_p, ctypes.c_size_t)
        POLL = ctypes.CFUNCTYPE(None)
        STATE = ctypes.CFUNCTYPE(ctypes.c_int16, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint)

        seen = {"w": 0, "h": 0, "nonblack": 0}

        def env(cmd, value):
            # SET_PIXEL_FORMAT(10) / GET_VARIABLE(15) / GET_LOG_INTERFACE(27) 等一律不认，
            # 核心会走默认值；我们只关心它会不会崩。
            return False

        def video(ptr, w, h, pitch):
            if not ptr:
                return
            seen["w"], seen["h"] = w, h
            if w * h * 4 > 64 << 20:
                return
            buf = (ctypes.c_uint32 * (w * h)).from_address(ptr)
            n = sum(1 for i in range(w * h) if buf[i] & 0x00FFFFFF)
            seen["nonblack"] = n

        def batch(ptr, n):
            return n

        env_cb, video_cb = ENV(env), VIDEO(video)
        audio_cb, batch_cb = AUDIO(lambda l, r: None), BATCH(batch)
        poll_cb, state_cb = POLL(lambda: None), STATE(lambda p, d, i, dev: 0)

        lib.retro_set_environment(env_cb)
        lib.retro_set_video_refresh(video_cb)
        lib.retro_set_audio_sample(audio_cb)
        lib.retro_set_audio_sample_batch(batch_cb)
        lib.retro_set_input_poll(poll_cb)
        lib.retro_set_input_state(state_cb)

        lib.retro_api_version.restype = ctypes.c_uint
        lib.retro_init()

        class GameInfo(ctypes.Structure):
            _fields_ = [("path", ctypes.c_char_p), ("data", ctypes.c_void_p),
                        ("size", ctypes.c_size_t), ("meta", ctypes.c_char_p)]

        holder = ctypes.create_string_buffer(data, len(data))
        gi = GameInfo(cart_path.encode(), ctypes.cast(holder, ctypes.c_void_p), len(data), None)
        lib.retro_load_game.restype = ctypes.c_bool
        ok = lib.retro_load_game(ctypes.byref(gi))
        print("retro_load_game ->", bool(ok), flush=True)
        if not ok:
            lib.retro_deinit()
            result["rc"] = 1
            return

        for _ in range(frames):
            lib.retro_run()

        print("frames=%d  %dx%d  非黑像素=%d" % (frames, seen["w"], seen["h"], seen["nonblack"]), flush=True)
        lib.retro_unload_game()
        lib.retro_deinit()
        result["rc"] = 0 if seen["nonblack"] > 0 else 1
        result["pixels"] = seen["nonblack"]

    # 1MB：Windows 上 RetroArch 主线程的量级
    threading.stack_size(1024 * 1024)
    th = threading.Thread(target=body)
    th.start()
    th.join()
    print("exit:", result["rc"], "pixels:", result["pixels"])
    return result["rc"]


if __name__ == "__main__":
    sys.exit(main(sys.argv))
