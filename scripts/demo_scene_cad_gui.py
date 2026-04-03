import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime


LOGS = []
GUI_ENV_REMOVE_KEYS = [
    "PYTHONHOME",
    "PYTHONPATH",
    "PYTHONEXECUTABLE",
    "__PYVENV_LAUNCHER__",
]


def log(message: str):
    text = str(message)
    LOGS.append(text)
    print(text, file=sys.stderr)


def build_parser():
    parser = argparse.ArgumentParser(description="FreeCAD GUI capture for demo scene")
    parser.add_argument("--model-path", default=os.environ.get("DEMO_SCENE_MODEL_PATH", ""))
    parser.add_argument("--output-dir", default=os.environ.get("DEMO_SCENE_OUTPUT_DIR", ""))
    return parser


def ensure_output_dir(path_value: str) -> str:
    target = os.path.abspath(path_value)
    os.makedirs(target, exist_ok=True)
    return target


def run_osascript(script: str, env=None) -> str:
    result = subprocess.run(
        ["osascript", "-e", script],
        check=True,
        capture_output=True,
        text=True,
        env=env or os.environ.copy()
    )
    return (result.stdout or "").strip()


def build_gui_env():
    env = os.environ.copy()
    for key in GUI_ENV_REMOVE_KEYS:
        env.pop(key, None)

    path_entries = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ]
    existing_path = env.get("PATH", "")
    for entry in reversed(path_entries):
        if entry not in existing_path.split(":"):
            existing_path = f"{entry}:{existing_path}" if existing_path else entry
    env["PATH"] = existing_path
    return env


def run_cliclick(commands):
    result = subprocess.run(
        ["cliclick", "-e", "1", "-w", "60", *commands],
        check=True,
        capture_output=True,
        text=True
    )
    return (result.stdout or "").strip()


def ensure_freecad_frontmost() -> tuple:
    script = """
tell application "FreeCAD" to reopen
tell application "FreeCAD" to activate
tell application "System Events"
    tell process "FreeCAD"
        set frontmost to true
        repeat 40 times
            if (count of windows) > 0 then exit repeat
            delay 0.5
        end repeat
        if (count of windows) is 0 then error "未找到 FreeCAD 窗口"
        try
            set value of attribute "AXMain" of front window to true
        end try
        try
            set value of attribute "AXMinimized" of front window to false
        end try
        try
            perform action "AXRaise" of front window
        end try
        delay 0.3
        set winPos to position of front window
        set winSize to size of front window
        return (item 1 of winPos as text) & "," & (item 2 of winPos as text) & "," & (item 1 of winSize as text) & "," & (item 2 of winSize as text)
    end tell
end tell
"""
    raw = run_osascript(script)
    parts = [int(float(part.strip())) for part in raw.split(",")]
    if len(parts) != 4:
        raise RuntimeError(f"无法解析 FreeCAD 窗口尺寸: {raw}")
    return tuple(parts)


def activate_freecad_and_get_bounds() -> tuple:
    bounds = ensure_freecad_frontmost()
    log("已将 FreeCAD 窗口切到桌面最前方")
    return bounds


def clamp_point(bounds: tuple, point: tuple, padding: int = 80) -> tuple:
    x, y, width, height = bounds
    px, py = point
    min_x = x + padding
    max_x = x + max(padding, width - padding)
    min_y = y + padding
    max_y = y + max(padding, height - padding)
    return (
        max(min_x, min(max_x, int(px))),
        max(min_y, min(max_y, int(py)))
    )


def build_drag_path(start: tuple, end: tuple, segments: int = 4):
    points = []
    for index in range(1, segments + 1):
        ratio = index / float(segments)
        points.append((
            int(start[0] + ((end[0] - start[0]) * ratio)),
            int(start[1] + ((end[1] - start[1]) * ratio))
        ))
    return points


def run_demo_view_sequence():
    sequence = [
        ("0", "切到等轴测视图"),
        ("1", "切到前视图"),
        ("2", "切到顶视图"),
        ("3", "切到右视图"),
        ("0", "回到等轴测视图"),
    ]
    for key, message in sequence:
        log(message)
        ensure_freecad_frontmost()
        script = f"""
tell application "FreeCAD" to activate
tell application "System Events"
    tell process "FreeCAD"
        set frontmost to true
        delay 0.8
        keystroke "{key}"
        delay 2.2
    end tell
end tell
"""
        run_osascript(script)


def run_demo_drag_sequence(bounds: tuple) -> bool:
    if not shutil.which("cliclick"):
        log("未检测到 cliclick，回退到键盘视角切换")
        return False

    x, y, width, height = bounds
    canvas_center = (
        x + int(width * 0.56),
        y + int(height * 0.58)
    )
    canvas_center = clamp_point(bounds, canvas_center, padding=110)

    drag_specs = [
        (
            "第一段：向左大幅旋转，先把模型侧面甩出来",
            clamp_point(bounds, (canvas_center[0] + 220, canvas_center[1] + 30), padding=110),
            clamp_point(bounds, (canvas_center[0] - 230, canvas_center[1] + 20), padding=110),
        ),
        (
            "第二段：向下压一点，做出明显俯视变化",
            clamp_point(bounds, (canvas_center[0] - 80, canvas_center[1] - 170), padding=110),
            clamp_point(bounds, (canvas_center[0] - 10, canvas_center[1] + 190), padding=110),
        ),
        (
            "第三段：向右上回抬，切到更立体的展示方向",
            clamp_point(bounds, (canvas_center[0] - 180, canvas_center[1] + 120), padding=110),
            clamp_point(bounds, (canvas_center[0] + 170, canvas_center[1] - 140), padding=110),
        ),
        (
            "第四段：小幅收尾，停在最终展示角度",
            clamp_point(bounds, (canvas_center[0] + 70, canvas_center[1] - 20), padding=110),
            clamp_point(bounds, (canvas_center[0] - 60, canvas_center[1] + 55), padding=110),
        ),
    ]

    ensure_freecad_frontmost()
    log("先点击 FreeCAD 画布，确保后续拖拽落在 3D 视图上")
    run_cliclick([
        f"m:{canvas_center[0]},{canvas_center[1]}",
        "w:250",
        "c:.",
        "w:900",
    ])

    for message, start, end in drag_specs:
        log(message)
        ensure_freecad_frontmost()
        commands = [
            f"m:{start[0]},{start[1]}",
            "w:180",
            "dd:.",
            "w:120",
        ]
        for point in build_drag_path(start, end, segments=6):
            commands.append(f"dm:{point[0]},{point[1]}")
            commands.append("w:200")
        commands.extend([
            f"du:{end[0]},{end[1]}",
            "w:1250",
        ])
        run_cliclick(commands)

    return True


def capture_window_region(target_path: str, bounds: tuple):
    x, y, width, height = bounds
    x = max(0, x)
    y = max(0, y)
    width = max(100, width)
    height = max(100, height)
    region = f"{x},{y},{width},{height}"
    subprocess.run(
        ["screencapture", "-x", "-R", region, target_path],
        check=True,
        capture_output=True,
        text=True
    )


def main():
    args, _unknown = build_parser().parse_known_args()
    model_path = os.path.abspath(args.model_path)
    output_dir = ensure_output_dir(args.output_dir)

    try:
        if not os.path.exists(model_path):
            raise RuntimeError(f"CAD 模型不存在: {model_path}")

        gui_env = build_gui_env()
        removed_env_keys = [key for key in GUI_ENV_REMOVE_KEYS if os.environ.get(key)]
        if removed_env_keys:
            log(f"启动 FreeCAD 前已清理环境变量: {', '.join(removed_env_keys)}")

        log(f"打开 FreeCAD 模型: {model_path}")
        subprocess.run(
            ["open", "-a", "/Applications/FreeCAD.app", model_path],
            check=True,
            capture_output=True,
            text=True,
            env=gui_env
        )
        time.sleep(6)

        log("激活 FreeCAD 窗口并等待界面稳定")
        bounds = activate_freecad_and_get_bounds()
        time.sleep(1.0)

        log("执行 CAD 演示动作")
        if run_demo_drag_sequence(bounds):
            log("已完成真实鼠标拖拽旋转")
        else:
            log("执行演示视角切换：等轴测 -> 前视 -> 顶视 -> 右视 -> 等轴测")
            run_demo_view_sequence()
        bounds = activate_freecad_and_get_bounds()
        time.sleep(1.0)

        log("截图前再次确保 FreeCAD 保持最前")
        bounds = activate_freecad_and_get_bounds()
        time.sleep(0.5)
        screenshot_path = os.path.join(
            output_dir,
            f"freecad_gui_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        )
        capture_window_region(screenshot_path, bounds)
        log(f"截图已保存: {screenshot_path}")

        result = {
            "success": True,
            "modelPath": model_path,
            "screenshots": [screenshot_path],
            "logs": LOGS
        }
        print(json.dumps(result, ensure_ascii=True))
        return 0
    except Exception as error:
        print(json.dumps({
            "success": False,
            "error": str(error),
            "logs": LOGS
        }, ensure_ascii=True))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
