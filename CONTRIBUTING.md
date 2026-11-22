# 开发与贡献

## 环境与命令

使用 Node.js 24 和 pnpm 8.10.5。先执行 `pnpm install --frozen-lockfile`，再执行 `pnpm dev`。

| 命令                | 用途                 |
| ------------------- | -------------------- |
| `pnpm dev`          | 启动开发服务器       |
| `pnpm format`       | 格式化全部源码和文档 |
| `pnpm format:check` | 检查格式是否统一     |
| `pnpm typecheck`    | TypeScript 检查      |
| `pnpm build`        | 类型检查与生产构建   |
| `pnpm preview`      | 本地预览构建产物     |

目前没有独立的 lint 或自动化测试脚本。已配置 Prettier 格式检查。不要把本地浏览器冒烟检查写成已覆盖全部浏览器的测试结论。

## 代码结构

| 文件                                           | 职责                                     |
| ---------------------------------------------- | ---------------------------------------- |
| `src/App.tsx`                                  | 工作台布局、主题、缩放及实例列表         |
| `src/Breadboard.tsx`                           | 面包板、板件与针脚标签渲染               |
| `src/simulation.js`                            | 布线网络、拖拽、撤销、通电锁定及模拟效果 |
| `src/catalog.ts`                               | 针脚定义、占位尺寸、导通孔位与实例类型   |
| `src/hardwareCatalog.ts`                       | 硬件库分类、搜索词与练习说明             |
| `src/placement.ts`                             | 最近落点匹配                             |
| `src/workspaceDraft.ts`                        | 本地草稿边界校验和保存                   |
| `src/HardwareLibrary.tsx`                      | 硬件选择面板                             |
| `src/ModuleDetails.tsx`                        | 针脚说明弹窗                             |
| `src/design-tokens.css` / `src/styles.css`     | 设计变量及界面样式                       |
| `src/theme-toggle.css` / `src/themeArtwork.ts` | 昼夜切换动画与插画                       |

React 渲染布局，模拟器维护画布上的交互状态。修改 DOM 标识、按钮结构或状态节点时，要检查 simulation.js 中对应的选择器与事件处理。

## 新增模块

1. 在 hardwareCatalog.ts 中添加类型、分类、关键词和说明。
2. 在 catalog.ts 中定义针脚、描述、期望源和物理占位。检查跨槽、跨板及多实例。
3. 若需要可交互测试，在 App.tsx 添加对应面板，并在 simulation.js 补齐网络校验、测试入口、测试效果和断电重置。
4. 准确标注电源和模拟范围。新增目录项不代表已实现模拟测试。
5. 按 [设计规范](DESIGN.md) 使用现有变量和控件；不要为单个样式变更升级依赖。

## 验证清单

- 执行 `pnpm build`，检查是否有新的错误或警告。
- 空工作台到完整布线，覆盖同类多个实例。
- 点击放置、按住拖动、随动连线、选线、Delete 与撤销。
- 通电禁止编辑，断电恢复编辑，刷新保留草稿。
- 浅色/深色、窄屏、长文本、孔位焦点及减少动态效果模式。
- 100% 高度适配，通断电时画布位置与孔距稳定。
- 硬件库、下拉菜单、详情弹窗滚动不穿透。
- 用项目子路径访问构建产物，检查 JS、CSS、Favicon、插画和音频没有 404。

反馈问题时请附浏览器版本、屏幕尺寸、复现步骤和截图；请勿粘贴含敏感信息的浏览器存储或个人数据。

## 代码格式

统一使用 2 空格缩进、LF 换行，单引号 JS/TS 字符串。HTML/JSX 的嵌套元素和相邻标签换行书写；只有纯文字内容的简单标签可以保持单行。较长的标签属性逐行展开。执行 `pnpm format` 应用格式，执行 `pnpm format:check` 检查。SVG 插画存放为独立资源，避免将整段标记压进字符串。
