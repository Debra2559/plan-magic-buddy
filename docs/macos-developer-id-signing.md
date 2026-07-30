# macOS Developer ID 签名与 Notarization

这个项目已配置 `npm run electron:package:mac:signed` 和 GitHub Actions 工作流，用来生成不会被 Gatekeeper 标记为“已损坏”的 macOS 客户端。

## 需要准备

1. Apple Developer Program 账号。
2. `Developer ID Application` 证书，导出为 `.p12`。
3. Apple ID 的 app-specific password。
4. Team ID。

## GitHub Actions Secrets

在 GitHub 仓库的 Actions secrets 中添加：

- `CSC_LINK`：`.p12` 文件的 base64 内容。
- `CSC_KEY_PASSWORD`：导出 `.p12` 时设置的密码。
- `APPLE_ID`：Apple Developer 登录邮箱。
- `APPLE_APP_SPECIFIC_PASSWORD`：Apple ID app-specific password。
- `APPLE_TEAM_ID`：Apple Developer Team ID。
- `APPLE_SIGNING_IDENTITY`：可选，形如 `Developer ID Application: Your Name (TEAMID)`。

生成 `CSC_LINK`：

```bash
base64 -i DeveloperIDApplication.p12 | pbcopy
```

## 生成下载包

1. 打开 GitHub Actions。
2. 运行 `Build signed macOS client`。
3. 选择 `arm64`、`x64` 或 `universal`。
4. 下载产物 `Sylva-Calendar-mac-*-signed-notarized.zip`。

## 本机 Mac 打包

证书已安装在 Keychain 后：

```bash
npm ci
SIGN_MAC=true \
APPLE_ID="你的 Apple ID" \
APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx" \
APPLE_TEAM_ID="TEAMID" \
npm run electron:package:mac
```

成功后可以验证：

```bash
codesign --verify --deep --strict --verbose=2 "electron-release/Sylva 日历-darwin-arm64/Sylva 日历.app"
xcrun stapler validate "electron-release/Sylva 日历-darwin-arm64/Sylva 日历.app"
spctl --assess --type execute --verbose=4 "electron-release/Sylva 日历-darwin-arm64/Sylva 日历.app"
```