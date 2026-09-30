# 全国云量预报地图 · GitHub 部署说明

部署后效果：GitHub Pages 托管网页（永久免费、不休眠），GitHub Actions 每天北京时间 09:10 和 21:10 自动抓取最新 11 天预报数据并提交回仓库，网页数据随之更新。

## 一、创建仓库

1. 注册 / 登录 GitHub（https://github.com）
2. 右上角「+」→「New repository」
3. 仓库名随意（例如 `cloud-map`），**必须选 Public**（免费版 Pages 只支持公开仓库）
4. 不要勾选「Add a README」，直接点「Create repository」

## 二、上传项目文件

1. 在 Kimi 对话的「全部文件」卡片里下载整个项目，解压
2. 打开新建的仓库页面，点「uploading an existing file」链接
3. 把解压后的**所有文件和文件夹**（包括 `.github` 文件夹、`.nojekyll`）拖进上传区，点「Commit changes」
   - 注意：`.github` 和 `.nojekyll` 是隐藏文件，Mac 在文件夹里按 `Cmd + Shift + .` 显示；Windows 需在文件资源管理器勾选「隐藏的项目」
   - 网页上传如果提示文件太多，可分两次：先传 `.github` 文件夹，再传其余文件

## 三、开启 Pages（网页托管）

1. 仓库页 →「Settings」→ 左侧「Pages」
2. 「Source」选 **Deploy from a branch**
3. 「Branch」选 **main**，文件夹选 **/(root)**，点「Save」
4. 等 1–2 分钟，刷新该页面，顶部会出现网址：`https://你的用户名.github.io/仓库名/`

## 四、开启自动更新（Actions）

1. 仓库页 →「Settings」→ 左侧「Actions」→「General」
2. 拉到「Workflow permissions」，选 **Read and write permissions**，点「Save」
3. 点顶部「Actions」标签，如提示启用工作流，点「I understand my workflows, go ahead and enable them」
4. 左侧选「更新云量数据」→ 右侧「Run workflow」→「Run workflow」手动跑一次验证
5. 约 1–2 分钟后任务变绿勾，仓库里 `data.json` 的提交记录出现「数据更新 …」即成功

## 五、验证

打开 `https://你的用户名.github.io/仓库名/`，「全国概况」窗口底部的「数据采集时间」应显示最近一次抓取时间。此后每天 09:10 / 21:10（北京时间）自动更新，无需任何操作。

## 常见问题

- **网页 404**：Pages 生效需 1–2 分钟；确认仓库是 Public、第三步已保存
- **Actions 任务红叉**：一般是第四步的「Read and write permissions」没开；偶发是 Open-Meteo 接口超时，手动再 Run 一次即可（抓取失败不会破坏旧数据）
- **想停用自动更新**：Actions → 更新云量数据 → 右上「⋯」→「Disable workflow」
- **server.js / Dockerfile**：这两个文件是给 Kimi 动态版用的，GitHub 方案用不到，留着不影响
