# GitHub Pages 部署

## 仓库内容

本说明以 **workbench 本身作为仓库根目录**。建议仓库名称 `esp32-wirelab`，默认分支 `main`。

```text
esp32-wirelab/
├── .github/workflows/pages.yml
├── docs/
├── public/
├── src/
├── index.html
├── package.json
├── pnpm-lock.yaml
└── vite.config.ts
```

上传源码、文档、锁文件和隐藏目录 `.github/`；不上传 `node_modules/`、`dist/`、本地环境文件或系统临时文件。`.gitignore` 已覆盖这些内容。外层的个人接线清单和任务记录不属于本仓库。

## 开启部署

1. 在 GitHub 创建仓库，把当前文件夹内的项目文件上传到仓库根目录，默认分支使用 `main`。
2. 打开仓库 Settings → Pages，在 Build and deployment 下将 Source 设为 **GitHub Actions**。
3. 打开 Actions，确认允许仓库工作流运行；上传时也要包含 `.github/workflows/pages.yml`。
4. 推送到 `main`，或在 Actions 中手动运行 **Build and deploy Pages**。
5. 工作流成功后，从部署环境 `github-pages` 或 Settings → Pages 打开网址。

普通项目站点的网址形如 `https://<用户名>.github.io/esp32-wirelab/`。请用实际部署输出替换此示例，不要将占位地址当成已上线链接。

工作流在 PR 中执行安装和构建；仅 `main` 分支的非 PR 运行执行部署。若默认分支不同，需要同步修改工作流的触发分支与部署条件。

## 资源路径与构建

项目使用 Vite 相对 `base: './'`，Favicon 通过 `%BASE_URL%` 引用；主板插画与音频通过源码导入参与打包。部署到不同仓库子路径或域名根目录时，不需要硬编码仓库名称。当前没有路径路由，页面刷新不依赖额外的 SPA 回退配置。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm preview
```

发布产物为 `dist/`。不要将开发服务器或 `src/` 直接当作 Pages 发布目录，也不要用双击 `dist/index.html` 的方式验证模块加载。

## 排错

- **Actions 没有运行**：检查隐藏工作流文件是否上传、分支是否为 main、仓库是否允许 Actions。
- **安装失败**：使用项目指定的 pnpm 版本，确认锁文件和 package.json 一起上传；不要为绕过失败随意删除锁文件。
- **部署权限失败**：确认 Pages 来源为 GitHub Actions；检查 github-pages 环境是否有保护规则需要人工批准。工作流部署任务使用 `pages: write` 和 `id-token: write`，不需要个人 Token。
- **部署后白屏或图标丢失**：浏览器 Network 中检查资源 404；确认发布的是新构建产物，并保留 vite.config.ts 与 HTML 的 BASE_URL 写法。
- **旧界面仍显示**：强制刷新；如果网站域名改变，旧域名下的 localStorage 不会自动迁移。

## 发布前检查

核对 [素材说明](../THIRD_PARTY_NOTICES.md) 中的音频来源和上游许可，并选择项目整体许可证。检查空工作台、硬件放置、接线、通断电、刷新恢复、针脚详情、深浅主题及目标浏览器音频。当前尚不具备完整移动端和键盘无障碍体验。

## 官方参考

- [Vite 静态部署](https://vite.dev/guide/static-deploy.html#github-pages)
- [Vite 相对基础路径](https://vite.dev/guide/build.html#relative-base)
- [GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
