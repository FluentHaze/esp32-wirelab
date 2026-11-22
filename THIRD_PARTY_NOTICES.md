# 素材与第三方说明

## 运行依赖与构建工具

项目使用 React、React DOM、Lucide React、Vite、TypeScript 和 React 类型定义。版本以 package.json 和 pnpm-lock.yaml 为准；各依赖许可证以安装包自带的 LICENSE/NOTICE 为准，不能由项目整体许可证代替。

## 昼夜切换动画

- 原作者：Jhey Tompkins（jh3y）。
- 原始作品：[Night & Day Toggle](https://codepen.io/jh3y/pen/LYgjpYZ)。
- 用户提供的参考镜像：[RunJS 示例](https://runjs.work/projects/7884b5)。
- 项目适配文件：`src/theme-toggle.css`、`src/themeArtwork.ts`、`src/assets/theme-artwork.svg`。
- 修改内容：移除持续装饰，缩为工具栏控件，接入主题缓存、局部样式和减少动态效果模式。

[CodePen 授权说明](https://blog.codepen.io/documentation/licensing/)指出公开 Pen 默认采用 MIT 许可。原作的具体版权声明与导出版本应由发布者核对并保留；当前源码已保留作者和原始链接，不代表这份文档替代完整上游许可文本。

## 本地 SVG

`src/assets/esp32-s3.svg` 与 `public/favicon.svg` 是本项目绘制的示意图，未使用产品实物照片。示意图不是精确工程尺寸，也不表示 Espressif 官方认证。产品名称和型号用于识别学习对象。

## 示例音频

`src/voice-reply.m4a` 用于模拟语音回复。当前仓库未附其来源、配音方式或授权凭据，公开分发前需要由发布者确认使用与再分发权限；无法确认时应移除或替换，并同步调整播放器引用。测试音和蜂鸣测试音由程序生成。

## 项目整体许可证

当前未添加整体 LICENSE。公开仓库或通过 Pages 提供在线服务，不等于已选择开源许可证。发布者应根据预期的复用方式选择许可证，并单独满足上述第三方素材要求。
