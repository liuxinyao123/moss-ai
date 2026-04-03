# DSClaw 品牌资源

- `dsclaw-icon.svg` / `dsclaw-icon.png`：应用图标（顶栏、favicon、协作页等）
- `dsclaw-logo-horizontal.svg` / `.png`、`dsclaw-logo-main.svg` / `.png`：横版与主视觉（关于页、启动图等）
- `icon.png`：与 `dsclaw-icon.png` 对齐，供 **Electron 窗口** `BrowserWindow` 与 `apple-touch-icon` 使用；更新 SVG 后可运行仓库根目录 `npm run icons` 从矢量重新栅格化，或直接用 `dsclaw-logo-package` 里导出的 PNG 覆盖

源文件可同步自仓库根目录的 `dsclaw-logo-package/`。
