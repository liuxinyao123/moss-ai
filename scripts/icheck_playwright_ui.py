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


def wait_and_check(page, selector: str, timeout: int = 10000) -> bool:
    try:
        page.wait_for_selector(selector, timeout=timeout)
        return True
    except Exception:
        return False


def make_output_dir(path_value: str) -> str:
    target = os.path.abspath(path_value)
    os.makedirs(target, exist_ok=True)
    return target


def save_page_screenshot(page, output_dir: str, name: str) -> str:
    filename = f"{name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
    target = os.path.join(output_dir, filename)
    page.screenshot(path=target, full_page=True)
    return target


def to_safe_task(task: dict) -> dict:
    return {
        "index": task.get("index"),
        "seq": task.get("seq"),
        "task_no": task.get("task_no"),
        "task_name": task.get("task_name")
    }


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


def step1_navigate_to_my_tasks(page, base_url: str):
    log("Step 1: 导航到任务管理 / 我的任务")
    page.goto(f"{base_url}/task/myTask/index")
    page.wait_for_load_state("networkidle")

    if wait_and_check(page, ".el-breadcrumb"):
        breadcrumb = page.locator(".el-breadcrumb").inner_text().strip()
        log(f"当前路径: {breadcrumb}")
        return breadcrumb

    raise RuntimeError(f"页面未正确加载，请检查登录状态。当前 URL: {page.url}")


def step2_get_task_list(page) -> list:
    log("Step 2: 获取我的任务列表")
    page.wait_for_selector(".el-table__body .el-table__row", timeout=15000)
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)

    total_tip = page.locator("text=/共\\d+个任务/")
    if total_tip.count() > 0:
        log(total_tip.first.inner_text().strip())

    rows = page.locator(".el-table__body .el-table__row").all()
    tasks = []
    for index, row in enumerate(rows):
        cells = row.locator("td").all()
        if len(cells) < 3:
            continue

        seq = cells[0].inner_text().strip()
        task_no = cells[1].inner_text().strip()
        name_el = cells[2].locator(".click-common")
        task_name = name_el.inner_text().strip() if name_el.count() > 0 else cells[2].inner_text().strip()

        tasks.append({
            "index": index,
            "seq": seq,
            "task_no": task_no,
            "task_name": task_name,
            "row": row
        })
        log(f"[{seq}] 编号: {task_no} 名称: {task_name}")

    if not tasks:
        raise RuntimeError("未获取到任何任务，请检查页面或筛选条件")

    log(f"共获取到 {len(tasks)} 条任务")
    return tasks


def step3_click_task(page, context, tasks: list, task_index: int = 0, task_no: str = ""):
    target = None
    task_no = str(task_no or "").strip()
    if task_no:
        target = next((item for item in tasks if item.get("task_no") == task_no), None)
    if target is None:
        if task_index < 0 or task_index >= len(tasks):
            raise RuntimeError(f"任务索引越界: {task_index}")
        target = tasks[task_index]

    target_row = target["row"]
    target_task_no = target.get("task_no", "")
    name_link = target_row.locator(".click-common").first
    target_name = target.get("task_name", "")
    log(f"Step 3: 点击任务 {target_name} ({target_task_no})")

    try:
        target_row.scroll_into_view_if_needed(timeout=5000)
        time.sleep(0.3)
    except Exception:
        pass

    detail_page = None
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


def step4_get_check_items(detail_page) -> list:
    log("Step 4: 获取检查项列表")

    if not wait_and_check(detail_page, ".el-table", timeout=10000):
        log("未找到检查项表格")
        return []

    detail_page.wait_for_load_state("networkidle")
    time.sleep(0.5)

    empty_el = detail_page.locator(".el-table__empty-text")
    if empty_el.count() > 0 and "暂无数据" in empty_el.inner_text():
        log("该任务暂无检查项数据")
        return []

    all_rows = detail_page.locator(".el-table__body .el-table__row").all()
    check_items = []
    current_classify = ""

    for row in all_rows:
        cells = row.locator("td").all()
        if len(cells) < 4:
            continue

        row_class = row.get_attribute("class") or ""
        if "level-0" in row_class:
            classify_text = cells[1].inner_text().strip() if len(cells) > 1 else ""
            if classify_text:
                current_classify = classify_text
            continue

        item_no = cells[2].inner_text().strip() if len(cells) > 2 else ""
        item_name = cells[3].inner_text().strip() if len(cells) > 3 else ""
        item_state = cells[6].inner_text().strip() if len(cells) > 6 else ""
        exp_date = cells[7].inner_text().strip() if len(cells) > 7 else ""

        if item_no or item_name:
            check_items.append({
                "classify": current_classify,
                "item_no": item_no,
                "item_name": item_name,
                "state": item_state,
                "expect_date": exp_date
            })

    log(f"共获取到 {len(check_items)} 条检查项")
    return check_items


def build_parser():
    parser = argparse.ArgumentParser(description="iCheck Playwright UI automation")
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--user-data-dir", default="")
    parser.add_argument("--profile-directory", default="Default")
    parser.add_argument("--channel", default="")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--task-index", type=int, default=0)
    parser.add_argument("--task-no", default="")
    parser.add_argument("--cookie-file", default=os.path.expanduser("~/.icheck_cookie"))
    return parser


def main():
    args = build_parser().parse_args()
    output_dir = make_output_dir(args.output_dir)
    screenshots = []

    try:
        from playwright.sync_api import sync_playwright
    except Exception as error:
        print(json.dumps({
            "success": False,
            "error": f"未安装 Playwright 或导入失败: {error}",
            "logs": LOGS
        }, ensure_ascii=False))
        return 1

    browser = None
    context = None
    page = None
    detail_page = None

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
                    slow_mo=300,
                    args=launch_args,
                    no_viewport=True,
                )
                page = context.pages[0] if context.pages else context.new_page()
            else:
                browser = p.chromium.launch(
                    channel=args.channel or None,
                    headless=False,
                    slow_mo=300
                )
                context = browser.new_context(viewport={"width": 1440, "height": 900})
                page = context.new_page()

            apply_cookie_file(context, args.base_url, args.cookie_file)
            page.goto(f"{args.base_url}/home")
            page.wait_for_load_state("networkidle")
            if not wait_and_check(page, ".el-menu", timeout=15000):
                log(f"首页未发现登录后菜单，当前 URL: {page.url}")

            breadcrumb = step1_navigate_to_my_tasks(page, args.base_url)
            screenshots.append(save_page_screenshot(page, output_dir, "my_tasks"))

            tasks = step2_get_task_list(page)
            if args.task_index < 0 or args.task_index >= len(tasks):
                raise RuntimeError(f"task_index 超出范围: {args.task_index}，当前任务总数 {len(tasks)}")

            detail_page, selected_task = step3_click_task(
                page,
                context,
                tasks,
                task_index=args.task_index,
                task_no=args.task_no
            )
            screenshots.append(save_page_screenshot(detail_page, output_dir, "task_detail"))

            check_items = step4_get_check_items(detail_page)

            result = {
                "success": True,
                "baseUrl": args.base_url,
                "breadcrumb": breadcrumb,
                "currentUrl": detail_page.url,
                "taskCount": len(tasks),
                "selectedTask": to_safe_task(selected_task),
                "tasks": [to_safe_task(task) for task in tasks],
                "checkItems": check_items,
                "checkItemCount": len(check_items),
                "screenshots": screenshots,
                "logs": LOGS,
                "usedProfile": {
                    "userDataDir": args.user_data_dir,
                    "profileDirectory": args.profile_directory,
                    "channel": args.channel
                }
            }
            print(json.dumps(result, ensure_ascii=False))
            return 0
    except Exception as error:
        failure = {
            "success": False,
            "error": str(error),
            "logs": LOGS,
            "screenshots": screenshots
        }
        print(json.dumps(failure, ensure_ascii=False))
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
