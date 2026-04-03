#!/usr/bin/env python3
import argparse
import json
import os
import sys
import time
from datetime import datetime
from urllib.parse import urlparse


LOGS = []


def log(message: str):
    text = str(message)
    LOGS.append(text)
    print(text, file=sys.stderr)


def build_parser():
    parser = argparse.ArgumentParser(description="iCheck batch submit by Playwright")
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--user-data-dir", default="")
    parser.add_argument("--profile-directory", default="Default")
    parser.add_argument("--channel", default="")
    parser.add_argument("--cookie-file", default=os.path.expanduser("~/.icheck_cookie"))
    parser.add_argument("--task-index", type=int, default=0)
    parser.add_argument("--submit-mode", default="all", choices=["all", "first", "index"])
    parser.add_argument("--submit-indexes", default="0")
    parser.add_argument("--remark", default="")
    return parser


def wait_for(page, selector: str, timeout: int = 10000) -> bool:
    try:
        page.wait_for_selector(selector, timeout=timeout)
        return True
    except Exception:
        return False


def ensure_output_dir(path_value: str) -> str:
    target = os.path.abspath(path_value)
    os.makedirs(target, exist_ok=True)
    return target


def save_page_screenshot(page, output_dir: str, name: str) -> str:
    filename = f"{name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
    target = os.path.join(output_dir, filename)
    try:
        page.screenshot(path=target, full_page=True, timeout=5000)
        return target
    except Exception as error:
        log(f"截图跳过: {error}")
        return ""


def apply_cookie_file(context, base_url: str, cookie_file: str):
    cookie_file = os.path.abspath(os.path.expanduser(str(cookie_file or "").strip()))
    if not cookie_file or not os.path.exists(cookie_file):
        log(f"未找到 cookie 文件，跳过注入: {cookie_file}")
        return

    host = urlparse(base_url).hostname or ""
    cookies = []
    with open(cookie_file, "r", encoding="utf-8", errors="ignore") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line:
                continue
            http_only = False
            if line.startswith("#HttpOnly_"):
                http_only = True
                line = line[len("#HttpOnly_"):]
            elif line.startswith("#"):
                continue

            parts = line.split("\t")
            if len(parts) < 7:
                continue
            domain, _flag, path, secure_flag, expires, name, value = parts[:7]
            domain = domain.lstrip(".")
            if host and domain and host != domain and not host.endswith(f".{domain}"):
                continue

            cookie = {
                "name": name,
                "value": value,
                "domain": domain or host,
                "path": path or "/",
                "httpOnly": http_only,
                "secure": str(secure_flag).upper() == "TRUE",
            }
            try:
                expires_float = float(expires)
                if expires_float > 0:
                    cookie["expires"] = expires_float
            except Exception:
                pass
            cookies.append(cookie)

    if not cookies:
        log("cookie 文件中没有可用的 iCheck 登录 cookie")
        return

    try:
        context.clear_cookies()
    except Exception:
        pass
    context.add_cookies(cookies)
    log(f"已注入 icheck-tools 登录 cookie，共 {len(cookies)} 条")


def parse_submit_indexes(raw: str):
    values = []
    for part in str(raw or "").split(","):
        item = part.strip()
        if not item:
            continue
        try:
            values.append(int(item))
        except ValueError:
            pass
    return values or [0]


def step1_go_to_my_tasks(page, base_url: str):
    log("Step 1: 导航到任务管理 / 我的任务")
    page.goto(f"{base_url}/task/myTask/index")
    page.wait_for_load_state("networkidle")

    if not wait_for(page, ".el-breadcrumb"):
        raise RuntimeError("页面未正确加载，请确认登录状态")

    breadcrumb = page.locator(".el-breadcrumb").inner_text().strip()
    log(f"当前路径: {breadcrumb}")
    return breadcrumb


def step2_get_task_list(page) -> list:
    log("Step 2: 获取任务列表")
    page.wait_for_selector(".el-table__body .el-table__row", timeout=15000)
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)

    total_tip = page.locator("text=/共\\d+个任务/")
    if total_tip.count() > 0:
        log(total_tip.first.inner_text().strip())

    rows = page.locator(".el-table__body .el-table__row").all()
    tasks = []
    for i, row in enumerate(rows):
        cells = row.locator("td").all()
        if len(cells) < 3:
            continue
        seq = cells[0].inner_text().strip()
        task_no = cells[1].inner_text().strip()
        name_el = cells[2].locator(".click-common")
        task_name = name_el.inner_text().strip() if name_el.count() > 0 else cells[2].inner_text().strip()
        tasks.append({
            "index": i,
            "seq": seq,
            "task_no": task_no,
            "task_name": task_name,
            "row": row
        })
        log(f"[{seq}] {task_no} {task_name}")

    if not tasks:
        raise RuntimeError("未找到任何任务")
    return tasks


def step3_open_task(page, context, tasks: list, task_index: int = 0):
    if task_index < 0 or task_index >= len(tasks):
        raise RuntimeError(f"任务索引越界: {task_index}")

    target = tasks[task_index]
    log(f"Step 3: 点击任务 {target['task_name']} ({target['task_no']})")

    target_row = target["row"]
    name_link = target_row.locator(".click-common").first
    try:
        target_row.scroll_into_view_if_needed(timeout=5000)
        time.sleep(0.3)
    except Exception:
        pass

    try:
        with context.expect_page(timeout=5000) as new_page_event:
            if name_link.count() > 0 and name_link.is_visible():
                name_link.click()
            else:
                target_row.click(force=True)
        detail_page = new_page_event.value
    except Exception:
        if name_link.count() > 0 and name_link.is_visible():
            name_link.click(force=True)
        else:
            target_row.click(force=True)
        detail_page = page

    detail_page.wait_for_load_state("networkidle")
    time.sleep(1.5)

    log(f"任务详情页已打开: {detail_page.url}")
    return detail_page, target


def step4_select_check_items(detail_page, mode: str = "all", indexes=None) -> int:
    log(f"Step 4: 勾选检查项（模式: {mode}）")

    if not wait_for(detail_page, ".el-table__row", timeout=10000):
        raise RuntimeError("检查项表格未加载")
    detail_page.wait_for_load_state("networkidle")
    time.sleep(0.5)

    data_rows = detail_page.locator(".el-table__row.el-table__row--level-1").all()
    if not data_rows:
        log("暂无可勾选的检查项")
        return 0

    selected_count = 0
    if mode == "all":
        header_checkbox = detail_page.locator(".el-table__header .el-checkbox").first
        if header_checkbox.count() > 0:
            header_checkbox.click(force=True)
            time.sleep(0.3)
            selected_count = len(data_rows)
            log(f"已全选 {selected_count} 条检查项")
        else:
            for row in data_rows:
                cb = row.locator(".el-checkbox").first
                if cb.count() > 0:
                    cb.click(force=True)
                    time.sleep(0.1)
                    selected_count += 1
            log(f"已逐行勾选 {selected_count} 条检查项")
    elif mode == "first":
        cb = data_rows[0].locator(".el-checkbox").first
        cb.click(force=True)
        time.sleep(0.3)
        selected_count = 1
        log("已勾选第 1 条检查项")
    elif mode == "index":
        for idx in (indexes or [0]):
            if idx < len(data_rows):
                cb = data_rows[idx].locator(".el-checkbox").first
                if cb.count() > 0:
                    cb.click(force=True)
                    time.sleep(0.2)
                    selected_count += 1
                    log(f"已勾选第 {idx + 1} 条检查项")
            else:
                log(f"序号 {idx} 超出范围（共 {len(data_rows)} 条）")
    return selected_count


def set_remark_if_possible(detail_page, remark: str):
    if not remark.strip():
        return ""
    selectors = ["textarea#remark", "#remark", "textarea[name='remark']"]
    for selector in selectors:
        locator = detail_page.locator(selector)
        if locator.count() > 0:
            locator.first.fill(remark)
            log(f"已填写备注: {selector}")
            return selector
    return ""


def step5_click_bulk_submit(detail_page):
    log("Step 5: 点击批量提交按钮")
    submit_btn = detail_page.locator("button.green-btn:has-text('批量提交')")
    if submit_btn.count() == 0:
        raise RuntimeError("未找到“批量提交”按钮")
    submit_btn.click()
    time.sleep(0.8)
    log("已点击批量提交")


def step6_confirm_submit_dialog(detail_page):
    log("Step 6: 处理确认弹窗")
    dialog_selector = ".el-dialog__wrapper:not([style*='display: none']) .el-dialog__title"
    if not wait_for(detail_page, dialog_selector, timeout=5000):
        log("未出现确认弹窗（可能无需确认或已完成）")
        return {"confirmed": False, "title": "", "body": ""}

    dialogs = detail_page.locator(".el-dialog__wrapper").all()
    visible_dialog = None
    for dialog in dialogs:
        try:
            style = dialog.get_attribute("style") or ""
            if "display: none" not in style:
                title_el = dialog.locator(".el-dialog__title")
                if title_el.count() > 0 and title_el.inner_text().strip():
                    visible_dialog = dialog
                    break
        except Exception:
            continue

    if not visible_dialog:
        log("弹窗已自动关闭或无弹窗")
        return {"confirmed": False, "title": "", "body": ""}

    title = visible_dialog.locator(".el-dialog__title").inner_text().strip()
    body = visible_dialog.locator(".el-dialog__body").inner_text().strip()
    log(f"弹窗标题: {title}")
    log(f"弹窗内容: {body}")

    confirm_btn = visible_dialog.locator("button.el-button--primary:has-text('确')")
    if confirm_btn.count() > 0:
        confirm_btn.click()
        time.sleep(1.0)
        log("已点击确定，提交完成")
        return {"confirmed": True, "title": title, "body": body}

    log("未找到确定按钮")
    return {"confirmed": False, "title": title, "body": body}


def step7_verify_result(detail_page):
    log("Step 7: 验证提交结果")
    detail_page.wait_for_load_state("networkidle")
    time.sleep(1.0)

    success_msg = detail_page.locator(".el-message--success")
    error_msg = detail_page.locator(".el-message--error")
    if success_msg.count() > 0:
        message = success_msg.inner_text().strip()
        log(f"系统提示: {message}")
    elif error_msg.count() > 0:
        message = error_msg.inner_text().strip()
        log(f"错误提示: {message}")
    else:
        message = "弹窗已关闭，提交请求已发送"
        log(message)

    data_rows = detail_page.locator(".el-table__row.el-table__row--level-1").all()
    log(f"当前检查项共 {len(data_rows)} 条（页面已刷新更新）")
    return {
        "message": message,
        "rowCount": len(data_rows)
    }


def main():
    args = build_parser().parse_args()
    output_dir = ensure_output_dir(args.output_dir)
    screenshots = []

    try:
        from playwright.sync_api import sync_playwright
    except Exception as error:
        print(json.dumps({"success": False, "error": f"导入 Playwright 失败: {error}", "logs": LOGS}, ensure_ascii=False))
        return 1

    browser = None
    context = None

    try:
        with sync_playwright() as p:
            launch_args = ["--start-maximized"]
            if args.profile_directory:
                launch_args.append(f"--profile-directory={args.profile_directory}")

            if args.user_data_dir:
                context = p.chromium.launch_persistent_context(
                    user_data_dir=args.user_data_dir,
                    channel=args.channel or None,
                    headless=False,
                    slow_mo=400,
                    args=launch_args,
                    no_viewport=True,
                )
                page = context.pages[0] if context.pages else context.new_page()
            else:
                browser = p.chromium.launch(channel=args.channel or None, headless=False, slow_mo=400)
                context = browser.new_context(viewport={"width": 1440, "height": 900})
                page = context.new_page()

            apply_cookie_file(context, args.base_url, args.cookie_file)
            page.goto(f"{args.base_url}/home")
            page.wait_for_load_state("networkidle")
            if not wait_for(page, ".el-menu", timeout=30000):
                raise RuntimeError("未检测到登录后菜单，请先完成登录")

            breadcrumb = step1_go_to_my_tasks(page, args.base_url)
            before_path = save_page_screenshot(page, output_dir, "my_tasks_before_submit")
            if before_path:
                screenshots.append(before_path)

            tasks = step2_get_task_list(page)
            detail_page, selected_task = step3_open_task(page, context, tasks, task_index=args.task_index)
            detail_before = save_page_screenshot(detail_page, output_dir, "task_detail_before_submit")
            if detail_before:
                screenshots.append(detail_before)

            selected = step4_select_check_items(
                detail_page,
                mode=args.submit_mode,
                indexes=parse_submit_indexes(args.submit_indexes),
            )
            if selected == 0:
                raise RuntimeError("没有勾选到任何检查项")

            remark_selector = set_remark_if_possible(detail_page, args.remark)
            step5_click_bulk_submit(detail_page)
            confirm_info = step6_confirm_submit_dialog(detail_page)
            verify_info = step7_verify_result(detail_page)

            detail_after = save_page_screenshot(detail_page, output_dir, "task_detail_after_submit")
            if detail_after:
                screenshots.append(detail_after)

            print(json.dumps({
                "success": True,
                "breadcrumb": breadcrumb,
                "selectedTask": {
                    "index": selected_task["index"],
                    "seq": selected_task["seq"],
                    "task_no": selected_task["task_no"],
                    "task_name": selected_task["task_name"]
                },
                "selectedCount": selected,
                "submitMode": args.submit_mode,
                "confirmInfo": confirm_info,
                "verifyInfo": verify_info,
                "remarkSelector": remark_selector,
                "currentUrl": detail_page.url,
                "screenshots": screenshots,
                "logs": LOGS
            }, ensure_ascii=False))
            return 0
    except Exception as error:
        print(json.dumps({
            "success": False,
            "error": str(error),
            "screenshots": screenshots,
            "logs": LOGS
        }, ensure_ascii=False))
        return 1
    finally:
        try:
            if context:
                context.close()
        except Exception:
            pass
        try:
            if browser:
                browser.close()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
