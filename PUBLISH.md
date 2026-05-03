# 发布检查清单

## 版本信息
- **版本**: v1.1.0
- **日期**: 2026-05-03
- **状态**: 已测试，准备发布

## 文件清单

### 必需文件
- [x] `app.json` - EvenRealities 应用配置
- [x] `index.html` - 入口文件
- [x] `src/main.ts` - 主应用逻辑
- [x] `src/main.test.ts` - 单元测试
- [x] `package.json` - 项目配置
- [x] `vite.config.ts` - 构建配置
- [x] `vitest.config.ts` - 测试配置
- [x] `eslint.config.js` - 代码规范
- [x] `.prettierrc` - 格式化配置
- [x] `.gitignore` - Git 忽略规则

### 文档文件
- [x] `README.md` - 项目说明
- [x] `CHANGELOG.md` - 变更日志
- [x] `LICENSE` - MIT 许可证
- [x] `PUBLISH.md` - 本文件

### 资源文件
- [x] `public/favicon.svg` - 图标
- [x] `public/icons.svg` - 图标集合

## 测试状态
- [x] 76 个单元测试全部通过
- [x] ESLint 无错误
- [x] 代码格式化完成

## 打包步骤

### 1. 构建项目
```bash
npm run build
```

### 2. 打包 ehpk
```bash
npx @evenrealities/evenhub-cli pack app.json dist
```

### 3. 验证 ehpk
- 文件大小合理 (< 1MB)
- 包含所有必需资源

## GitHub 发布

### 创建 Release
1. 打标签: `git tag v1.1.0`
2. 推送标签: `git push origin v1.1.0`
3. 在 GitHub 创建 Release
4. 上传 `.ehpk` 文件作为附件

### Release 说明模板
```markdown
## Instrument Tuner v1.1.0

### 新增功能
- 音高示波器：实时显示音高偏差历史波形
- 分数进度显示：2/4 替代百分比
- 完整方向指示：UP/DOWN 替代缩写

### 优化
- 频率平滑算法：异常值阈值 5% -> 8%
- UI 布局适配 EvenRealities 576×288 屏幕

### 修复
- 文本溢出和居中问题
- 事件容器初始化

### 测试
- 76 个单元测试全部通过

**附件**: instrument-tuner-v1.1.0.ehpk
```

## 权限说明

本应用需要以下权限：
- **g2-microphone**: 访问麦克风进行实时音高检测

## 开源协议

MIT License - 详见 [LICENSE](LICENSE)
