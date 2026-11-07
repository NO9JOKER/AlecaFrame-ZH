# 架构契约 schema

| 文件 | 对应用途 | 状态 |
|---|---|---|
| `pages.schema.json` | 根 `pages.json`：页面注册表 | 已提供 schema；`pages.json` 已建立初始数据 |
| `modules.schema.json` | `src/runtime/modules.json`：运行时模块装配 | 已提供 schema；清单待运行时实现时创建 |
| `ocr-manifest.schema.json` | `src/ocr/manifest.json`：OCR 注册表 | 已提供 schema；清单待 OCR 边界实现时创建 |
| `dict-manifest.spec.md` | `dict/manifest.tsv`：词典加载清单 | 规范已提供；TSV 待词典工作流实现时创建 |

## 校验

```powershell
python tools\check_contracts.py
```

校验范围：

- `pages.json`：schema、页面 id/officialWindow 唯一、OCR 脚本/宿主补丁目标页面有效；
- `schemas/*.json`：JSON 可解析；
- 其他 manifest 若尚未创建，打印 `planned` 而不是失败。

## 原则

- schema 只约束结构，不替代语义审查；
- 可推导的清单/数量由脚本生成或检查，不靠人肉同步；
- 修改 schema 视为契约变更，需要 ADR 或明确的 T2 评审。
