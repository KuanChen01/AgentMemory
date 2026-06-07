# Release Process

## Policy

- 正式版本只允许从 `master` 发布。功能分支可以开发、联调和验收，但不能直接打正式 tag 或 GitHub Release。
- 版本号采用严格 `SemVer`：`vMAJOR.MINOR.PATCH`。
- v1 阶段的正式分发渠道固定为 **GitHub Release + 默认源码归档**，不同时维护 npm 正式包和 Windows 安装器。
- 当前版本的单一事实来源是仓库根 `package.json`；`package-lock.json` 的根版本必须和它保持一致。运行时与 MCP 对外暴露的版本都从这套元数据读取，不再各自硬编码。

## Maintainer Commands

在仓库根目录执行：

```bash
agentmem version
agentmem release-manifest --json
npm run release:plan -- --next patch
npm run release:bump -- --next patch
```

说明：

- `agentmem version`：打印当前产品版本。
- `agentmem release-manifest --json`：输出机器可读的 release metadata，供 `/admin/api/release-check` 与维护脚本读取。
- `npm run release:plan -- --next <patch|minor|major>`：生成这次发布的目标版本、tag、验证命令和人工步骤。
- `npm run release:bump -- --next <patch|minor|major>`：同步更新 `package.json` 与 `package-lock.json` 的根版本号。

## SemVer Rules

- `patch`：只包含 bug fix、文档修正、测试补强、bootstrap/installer 行为修复，且不引入新的 public surface。
- `minor`：向后兼容的新能力，例如新的 CLI 子命令、MCP 工具、admin API 字段、workbench 面板或可选配置项。
- `major`：任何破坏现有集成或升级路径的变化，例如必需重写配置、CLI flag 语义变更、admin/API 合约破坏、数据库/state 语义破坏，或要求用户重新 bootstrap 的路径变化。

## Checklist

1. 切到 `master`，并确认工作树干净。
2. 运行 `npm run release:plan -- --next <patch|minor|major>`，确认目标版本、tag 和说明无误。
3. 运行 `npm run release:bump -- --next <patch|minor|major>`。
4. 运行 `npm run build`，刷新 `dist/` 分发产物。
5. 运行 `node --test tests/*.test.cjs`。
6. 提交版本变更与分发产物，commit message 统一使用 `chore: release vX.Y.Z`。
7. 运行 `git tag vX.Y.Z`。
8. 运行 `git push origin master --follow-tags`。
9. 在 GitHub 上创建标题为 `vX.Y.Z` 的 Release，保留默认源码归档，并填写 release notes。
10. 发布后至少检查一次 GitHub Release 页面、tag 和源码归档是否正常；如果版本包含 bootstrap/install 路径变更，再补一次二机 bootstrap smoke。

## Release Notes Template

建议 release notes 至少包含这四段：

```md
## Highlights

## Operator Impact

## Upgrade Path

## Verification
```

建议写法：

- `Highlights`：只写本版最值得用户知道的能力变化。
- `Operator Impact`：说明哪些 agent、配置键、bootstrap 行为或 `/admin` 面板受影响。
- `Upgrade Path`：明确是否只需 `git pull` + `.\bootstrap-second-machine.cmd`，还是需要重新填配置、释放旧 worker、或重新注册某个 agent。
- `Verification`：列出本版实际跑过的 build/test/smoke 证据。
