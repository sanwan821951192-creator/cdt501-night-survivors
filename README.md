# 夜幕幸存者

[在线游玩](https://sanwan821951192-creator.github.io/cdt501-night-survivors/)

Python + pygame-ce 制作的中文生存小游戏，使用 pygbag 在浏览器运行。

- 生存 120 秒后自动进入无尽模式；技能可持续突破5级，每30秒敌潮变强，Boss周期性出现。武器自动攻击，收集水晶升级。
- 选择升级技能后获得 1 秒无敌，金色保护圈显示剩余时间；暂停和连续选卡不消耗保护时间。
- 电脑：WASD、方向键或鼠标移动；P 暂停，M 开关声音。
- 自动识别操作方式；电脑使用键鼠，手机显示右下半透明摇杆。松手停止，支持点击升级卡和暂停。
- Python/WASM、pygame 包和游戏资源完整托管于同一站点，启动不再访问外部 pygbag CDN。中文字体已按实际用字裁剪，游戏资源包约 168 KB。
- 运行时的大文件 main.data 和 main.wasm 使用 gzip 压缩，并按最多 256 KiB 分块下载。本版本共 36 个分块，压缩后合计 9,041,565 字节。
- 首屏显示已下载字节、总量和重试状态。每个分块、合并后的压缩文件及解压结果都经过 SHA256 校验；连接中断会重试，也可点击现有“重新加载”入口。
- 已完成、校验通过且成功缓存的分块可以复用；重新加载时只需继续获取缺少的分块。浏览器不支持流式解压时，加载器回退到原文件下载和校验。

## 来源与许可

像素素材来自 Kenney（CC0）；中文字体为 Noto Sans SC（SIL OFL）。
粒子与伤害飘字直接改编自 [yagizkoryurek/Vampire_Survivors-clone](https://github.com/yagizkoryurek/Vampire_Survivors-clone)，提交 ecbde04dda74ad9380dbe0cb9f7c29a636739117，MIT 许可。完整许可文本位于 licenses/，也包含于游戏资源包中。

此仓库保存已构建的 GitHub Pages 发布文件。Python 游戏源码位于 night-survivors.tar.gz 的 assets/ 目录。night-survivors.apk 是 pygbag 资源归档，不是 Android 安装包。
