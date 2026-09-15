# ApiDemo presets 验证记录

## Android：真机通过

- 设备：HUAWEI JAD-AL50，`SED0221812009951`。
- App：`com.agenteasyuse.mobileeasyuse.apidemo`；runtime 版本 `0.1.0`。
- 当前测试 APK 使用设备端口 `21848`，ADB 转发 `127.0.0.1:21849`；仓库默认端口未修改。
- 使用仓库 `src/index.js` 的 MCP connect 自动加载 `presets.dist.js`。
- 调用 `fixtures/android/ApiDemo/probe/presets/probe.js` 的 `verifyPresets()`，返回 `ok: true`。
- 首页 `homeVisible: true`，generation 为 0，交互计数均为 0。
- `api_menu_ui` 返回 `android.widget.LinearLayout`，shown/attached/enabled 均为 true，尺寸 1092 × 463。
- 缺失控件返回 null；空参数被拒绝。

环境问题：初始默认端口 8484 实际连接到了其他 App，其旧集成类缺少 `version()`；
版本查询先失败，未能进入 App ID 不匹配检查。本地 Maven 0.1.0 AAR 也确实缺少该方法，
已重新发布、构建并经用户授权覆盖安装 ApiDemo。独立测试 APK 避开端口冲突。
兼容性目录请求返回 HTTP 404，connect 提示跳过兼容性检查；实际运行验证成功。

## iOS 模拟器：通过

- 设备：iPhone 17，iOS 26.0，`FEE282C7-03EB-4A43-A61D-41661A7A6BBD`。
- App：`com.agenteasyuse.mobileeasyuse.apidemo.ios`；runtime 版本 `0.1.0`。
- 仓库 MCP connect 连接 `127.0.0.1:8484`，自动加载同一份 iOS presets bundle。
- 调用 `fixtures/ios/ApiDemo/probe/presets/probe.js` 的 `verifyPresets()`，返回 `ok: true`。
- homeAttached 为 true；generation 为 3，category/scenario 为 probe/method_log，text 为 restored。
  这些业务字段是之前场景保留的状态，并不表示当前仍在该页面，符合声明约定。
- `api.menu.ui` 返回 UIButton，label 为 UI capability，hidden 为 false，alpha 为 1，
  attached/userInteractionEnabled 均为 true。
- 缺失控件返回 null；空参数被拒绝。
- 兼容性目录 HTTP 404，版本兼容性检查跳过；实际运行验证成功。

## iOS 真机：排查后通过（保留首次失败记录）

- 设备：iPhone XS Max（设备名称 iPhone XR），iOS 18.7.10，USB 连接。
- CoreDevice ID：`AD69C370-8B30-574E-9500-5F0C75A6499D`。
- 复用硬件 UDID `00008020-000C519E2E06002E` 的 iproxy，Host 28484 → device 8484。
- 已实际发起仓库 MCP connect；LLDB 附加 ApiDemo PID 7413 成功。
- 加载 App 内 `Frameworks/MobileEasyUse.dylib` 时，10.385 秒后返回
  `Execution was interrupted, reason: signal SIGSTOP`，随后已 detach。
- 尚未进入 SDK/presets 加载和能力调用，不能认定真机验证通过。

Loader 的 direct dlopen 表达式使用最多 10 秒超时，且此次 allThreads 为 false；
失败时间与该上限相符，但尚未确定底层原因。LLDB 同时提示缺少设备的本地 shared cache。
失败后只读确认 ApiDemo 进程仍存在，没有重装、重启或重复 dlopen。
依照 to-ios-run 的 “Return other connect failures without retrying.” 规则保留失败现场。

### 后续排查及验证

用户授权排查后，确认原 PID 7413 已退出，未能取得故障时的完整线程栈。
没有修改 Loader、超时或线程设置，完成两种路径的真实验证：

1. App 不在运行，由 MCP 冷启动并加载：connect 成功，verifyPresets 返回 ok: true。
2. 断开会话，结束本次测试进程，正常启动 ApiDemo，再通过 MCP 附加加载：
   connect 成功，verifyPresets 再次返回 ok: true。

两次结果均为 main/catalog、generation 1、homeAttached true、counter/activationCount 0；
控件 api.menu.ui 为 UIButton，label 为 UI capability，attached true；
缺失控件为 null，非法参数被拒绝。runtime 版本 0.1.0。
两次兼容性目录均为 HTTP 404，仅跳过兼容性检查。

结论：真机及模拟器的 presets 均已实际通过验证。
首次失败位于 LLDB direct dlopen 阶段，耗时与代码 10 秒上限相符；
现有证据不足以区分原进程状态、调试器状态或首次加载耗时等因素。
原样附加路径也通过，未复现暂停其他线程导致的确定性故障，不能将其认定为根因。
未据此修改 Loader 或放宽超时；若再次出现，需在失败现场采集线程栈和加载耗时。
