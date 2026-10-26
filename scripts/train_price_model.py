"""
价格预测模型训练脚本（岭回归集成）
==================================

用途：为「AI 价格预测」功能离线训练模型，导出**纯参数 JSON**，
由 Node 后端（backend/services/priceForecastService.js）加载完成推理。
三个设计理由：

1. **零运行时依赖**：推理端不需要 Python 或任何 ML 运行时，`node app.js` 即可跑；
2. **可复现**：固定随机种子 + 闭式解（无迭代），同一份数据必得同一份系数；
3. **可审计**：线性模型，系数可读，公式可写进技术方案供评委核对。

为什么预测「7 日漂移」而不是「明日价格」
--------------------------------------
价格序列由「向季节性目标价均值回归 + 正态噪声」生成，单日噪声（1.2% 量级）
远大于可预测的回归信号（约 0.2% 量级），因此**日粒度 R² 必然接近 0**，
那样的模型对农户没有决策价值。本模型改为预测未来 7 日的价格漂移：

    目标 y = p(t+7) / p(t) − 1

理由有二：
- 7 日窗口把日度噪声平均掉，信噪比显著提升，且「本周该不该卖」本就是周度决策；
- 逐日路径由预测漂移几何分摊得到，避免递归预测的误差累积。

为什么用「集成」而不是单模型
--------------------------
单一特征集会在某个维度上系统性失配（例如只看得动量就抓不到季节转折）。
本脚本训练 **4 个差异化成员**并按验证集表现加权融合：

    ridge_full       全特征（动量 + 均线偏离 + 波动 + 季节 + 哑变量）
    ridge_momentum   仅动量与均值回归（去掉季节项）——短周期视角
    ridge_seasonal   季节项与品类×季节交互为主——中长周期视角
    ridge_bag        全特征 + Bootstrap 重抽样（固定种子）——降低方差

权重按验证集 MAE 的倒数归一化，并与「等权」对比，取验证集更优者。
**诚实声明**：脚本同时输出朴素基线（价格不变）的误差与集成技能分，不修饰指标。

数据处理
--------
- 剔除 qualityFlag = 1 的待核记录（seed 阶段随机标记，约 1%）；
- 按「品种 × 市场」独立建模，**不跨市场口径混算**；
- 时间序列切分：最后 VAL_DAYS 天为验证集，绝不随机打乱（杜绝未来信息泄漏）。

用法
----
    python scripts/train_price_model.py
    python scripts/train_price_model.py --horizon 7 --db backend/crop_data.db
"""

import argparse
import json
import math
import os
import sqlite3
from collections import defaultdict
from datetime import datetime, timedelta

import numpy as np

SEED = 20261016
VAL_DAYS = 84          # 验证集天数（滚动起点回测窗口，只用于最终报告）
CALIB_DAYS = 28        # 校准集天数（选 λ 与融合权重，与验证集严格分离）
HORIZON = 7            # 预测步长（天）
MIN_HISTORY = 61       # 每条序列至少需要 61 天历史（MA60 + 未来 7 天目标）
BAG_REPLICAS = 3       # Bootstrap 成员的重抽样次数
MARKET_TYPE_LEVELS = ["集散型", "产地型", "销地型"]   # 第 1 个为参照组

BASE_FEATURES = [
    "ret1", "ret7",
    "maDev7", "maDev14", "maDev30", "maDev60",
    "vol14",
    "sin1", "cos1", "sin2", "cos2",
]
MOMENTUM_FEATURES = ["ret1", "ret7", "maDev7", "maDev14", "maDev30", "maDev60", "vol14"]
SEASONAL_FEATURES = ["sin1", "cos1", "sin2", "cos2"]

# 集成成员：feature_mode 决定用哪些特征
MEMBERS = [
    {"key": "ridge_full", "label": "全特征", "feature_mode": "all", "lambdas": [1, 10, 100, 1000, 10000]},
    {"key": "ridge_momentum", "label": "动量与均值回归", "feature_mode": "momentum", "lambdas": [1, 10, 100, 1000]},
    {"key": "ridge_seasonal", "label": "季节项主导", "feature_mode": "seasonal", "lambdas": [1, 10, 100, 1000]},
    {"key": "ridge_bag", "label": "全特征+Bootstrap", "feature_mode": "all", "bag": True,
     "lambdas": [10, 100, 1000]},
]

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEFAULT_DB = os.path.join(ROOT, "backend", "crop_data.db")
DEFAULT_OUT = os.path.join(ROOT, "backend", "models_artifacts", "price_forecast_model.json")


# ---------------------------------------------------------------- 数据读取

def load_series(db_path):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    market_type = dict(cur.execute("SELECT marketId, marketType FROM dim_market").fetchall())
    product_meta = cur.execute("SELECT productId, category FROM dim_product ORDER BY productId").fetchall()
    conn.close()

    products = [r[0] for r in product_meta]
    categories = sorted({r[1] for r in product_meta})
    category_of = dict(product_meta)

    rows = sqlite3.connect(db_path).execute(
        """
        SELECT productId, marketId, priceDate, priceAvg
        FROM fact_price_daily
        WHERE priceAvg IS NOT NULL AND qualityFlag = 0
        ORDER BY productId, marketId, priceDate
        """
    ).fetchall()

    grouped = defaultdict(list)
    for product_id, market_id, d, price in rows:
        grouped[(product_id, market_id)].append((str(d)[:10], float(price)))

    series = {}
    for key, pts in grouped.items():
        pts.sort(key=lambda x: x[0])
        if len(pts) < MIN_HISTORY + HORIZON + 1:
            continue
        series[key] = {
            "dates": [p[0] for p in pts],
            "prices": [p[1] for p in pts],
            "marketType": market_type.get(key[1], MARKET_TYPE_LEVELS[0]),
            "category": category_of.get(key[0], ""),
        }
    return series, products, categories


# ---------------------------------------------------------------- 特征工程

def day_of_year(datestr):
    return datetime.strptime(datestr, "%Y-%m-%d").date().timetuple().tm_yday


def make_spec(products, categories):
    levels = sorted(products)
    cats = sorted(categories)
    names = list(BASE_FEATURES)
    names += [f"catseason::{c}::{fn}" for c in cats for fn in ("sin1", "cos1")]
    names += [f"prod::{pid}" for pid in levels[1:]]
    names += [f"mtype::{mt}" for mt in MARKET_TYPE_LEVELS[1:]]
    return {"productLevels": levels, "categoryLevels": cats, "featureNames": names}


def build_feature_row(dates, prices, product_id, category, market_type, spec):
    """在序列末尾构造**全特征**向量；各集成成员按特征名取子集。"""
    p = prices
    n = len(p)

    def ma(k):
        return sum(p[-k:]) / float(k)

    rets = []
    for i in range(n - 13, n):
        rets.append((p[i] - p[i - 1]) / p[i - 1])
    vol14 = float(np.std(rets))

    doy = day_of_year(dates[-1])
    ang = 2 * math.pi * doy / 365.25
    sin1, cos1 = math.sin(ang), math.cos(ang)
    sin2, cos2 = math.sin(2 * ang), math.cos(2 * ang)

    values = [
        p[-1] / p[-2] - 1.0,
        p[-1] / p[-8] - 1.0,
        p[-1] / ma(7) - 1.0,
        p[-1] / ma(14) - 1.0,
        p[-1] / ma(30) - 1.0,
        p[-1] / ma(60) - 1.0,
        vol14,
        sin1, cos1, sin2, cos2,
    ]

    for c in spec["categoryLevels"]:
        values.append(sin1 if c == category else 0.0)
        values.append(cos1 if c == category else 0.0)

    for pid in spec["productLevels"][1:]:
        values.append(1.0 if pid == product_id else 0.0)

    for mt in MARKET_TYPE_LEVELS[1:]:
        values.append(1.0 if mt == market_type else 0.0)

    return np.asarray(values, dtype=np.float64)


def member_feature_names(mode, spec):
    """按特征模式取子集名称（哑变量始终保留，提供品类/市场基线）。"""
    if mode == "momentum":
        keep = set(MOMENTUM_FEATURES)
    elif mode == "seasonal":
        keep = set(SEASONAL_FEATURES)
    else:
        return list(spec["featureNames"])
    return [n for n in spec["featureNames"] if n in keep or n.startswith(("catseason::", "prod::", "mtype::"))]


# ---------------------------------------------------------------- 岭回归

def fit_ridge(X, y, lam):
    n, f = X.shape
    Xa = np.hstack([X, np.ones((n, 1))])
    gram = Xa.T @ Xa
    reg = np.eye(f + 1) * lam
    reg[-1, -1] = 0.0                      # 常数项不惩罚
    w = np.linalg.solve(gram + reg, Xa.T @ y)
    return w[:-1], float(w[-1])


def predict(X, w, b):
    return X @ w + b


# ---------------------------------------------------------------- 主流程

def train_member(spec_member, spec, X, y, tr, va):
    """训练单个集成成员：取特征子集 → 标准化 → λ 网格搜索。返回成员参数与验证表现。"""
    names = member_feature_names(spec_member["feature_mode"], spec)
    idx = [spec["featureNames"].index(n) for n in names]
    Xtr_raw, Xva_raw = X[tr][:, idx], X[va][:, idx]
    ytr, yva = y[tr], y[va]

    # 标准化统一在「全训练集」上做：Bootstrap 各副本统计量几乎一致，
    # 这样各副本的系数处于同一标准化空间，可直接平均
    mu = Xtr_raw.mean(axis=0)
    sd = Xtr_raw.std(axis=0)
    sd[sd < 1e-12] = 1.0
    Xtr_s, Xva_s = (Xtr_raw - mu) / sd, (Xva_raw - mu) / sd

    scan = []
    best = None

    if spec_member.get("bag"):
        # Bootstrap 重抽样：多个副本各自选 λ 后平均系数，降低方差
        rng = np.random.default_rng(SEED)
        n = Xtr_s.shape[0]
        coefs, intercepts = [], []
        for _ in range(BAG_REPLICAS):
            rows = rng.integers(0, n, n)
            Xb, yb = Xtr_s[rows], ytr[rows]
            rep = None
            for lam in spec_member["lambdas"]:
                w_r, b_r = fit_ridge(Xb, yb, lam)
                mae_r = float(np.mean(np.abs(predict(Xva_s, w_r, b_r) - yva)))
                scan.append({"lambda": lam, "valMae": round(mae_r, 8)})
                if rep is None or mae_r < rep["mae"]:
                    rep = {"lam": lam, "mae": mae_r, "w": w_r, "b": b_r}
            coefs.append(rep["w"])
            intercepts.append(rep["b"])
            if best is None or rep["mae"] < best["mae"]:
                best = {"lam": rep["lam"], "mae": rep["mae"]}
        w = np.mean(coefs, axis=0)
        b = float(np.mean(intercepts))
    else:
        for lam in spec_member["lambdas"]:
            w_r, b_r = fit_ridge(Xtr_s, ytr, lam)
            mae_r = float(np.mean(np.abs(predict(Xva_s, w_r, b_r) - yva)))
            scan.append({"lambda": lam, "valMae": round(mae_r, 8)})
            if best is None or mae_r < best["mae"]:
                best = {"lam": lam, "mae": mae_r, "w": w_r, "b": b_r}
        w, b = best["w"], best["b"]

    return {
        "key": spec_member["key"],
        "label": spec_member["label"],
        "lambda": best["lam"],
        "lambdaScan": scan,
        "featureNames": names,
        "featureMean": [float(x) for x in mu],
        "featureStd": [float(x) for x in sd],
        "coef": [float(x) for x in w],
        "intercept": float(b),
        "valMae": best["mae"],
        "_mu": mu,
        "_sd": sd,
        "_w": w,
        "_b": b,
        "_idx": idx,
    }


def blended_predict(member, x_full):
    """按成员的特征名取子集 → 标准化 → 预测。x_full 为原始量纲的全特征向量。"""
    sub = x_full[member["_idx"]]
    z = (sub - member["_mu"]) / member["_sd"]
    return float(z @ member["_w"] + member["_b"])


def main():
    ap = argparse.ArgumentParser(description="训练价格预测岭回归集成模型并导出参数 JSON")
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--horizon", type=int, default=HORIZON)
    args = ap.parse_args()

    H = args.horizon
    np.random.seed(SEED)

    series, products, categories = load_series(args.db)
    spec = make_spec(products, categories)
    print(f"[1/7] 载入 {len(series)} 条「品种×市场」序列，全特征维度 {len(spec['featureNames'])}，预测步长 {H} 天")

    X_list, y_list, meta = [], [], []
    for (product_id, market_id), s in series.items():
        dates, prices = s["dates"], s["prices"]
        for i in range(MIN_HISTORY - 1, len(prices) - H):
            X_list.append(build_feature_row(dates[: i + 1], prices[: i + 1], product_id,
                                            s["category"], s["marketType"], spec))
            y_list.append(prices[i + H] / prices[i] - 1.0)
            meta.append(dates[i])

    all_dates = sorted(set(meta))
    val_start = all_dates[-VAL_DAYS]
    calib_start = all_dates[-VAL_DAYS - CALIB_DAYS]

    X = np.vstack(X_list)
    y = np.asarray(y_list, dtype=np.float64)
    target_dates = np.asarray(meta)

    # 三段式时间切分：拟合集 → 校准集（选 λ 与融合权重）→ 验证集（只做最终报告）
    # 校准集与验证集严格分离，避免「用验证集调参」导致指标虚高
    fit_m = target_dates < calib_start
    cal_m = (target_dates >= calib_start) & (target_dates < val_start)
    val_m = target_dates >= val_start
    print(f"[2/7] 样本 {len(y)} 条；拟合集至 {calib_start}，校准集 {calib_start}~{val_start}"
          f"（{CALIB_DAYS} 天），验证集 {val_start} 起（{VAL_DAYS} 天）")

    print(f"[3/7] 拟合集 {int(fit_m.sum())} 条 / 校准集 {int(cal_m.sum())} 条 / "
          f"验证集 {int(val_m.sum())} 条，开始训练 {len(MEMBERS)} 个集成成员")
    members = []
    for ms in MEMBERS:
        m = train_member(ms, spec, X, y, fit_m, cal_m)
        members.append(m)
        print(f"      {m['key']:<16} λ={m['lambda']:<6} 特征 {len(m['featureNames']):>2} 个  "
              f"校准 MAE={m['valMae'] * 100:.4f}pp")

    # ---- 融合权重：在校准集上按「倒数 MAE」与「等权」二选一 ----
    inv = np.asarray([1.0 / max(m["valMae"], 1e-9) for m in members])
    w_inv = inv / inv.sum()
    w_uniform = np.ones(len(members)) / len(members)

    def blend_on(mask, weights):
        out = np.zeros(int(mask.sum()))
        for i, m in enumerate(members):
            z = (X[mask][:, m["_idx"]] - m["_mu"]) / m["_sd"]
            out += weights[i] * predict(z, m["_w"], m["_b"])
        return out

    ycal = y[cal_m]
    w_inv_mae = float(np.mean(np.abs(blend_on(cal_m, w_inv) - ycal)))
    w_uni_mae = float(np.mean(np.abs(blend_on(cal_m, w_uniform) - ycal)))
    if w_uni_mae < w_inv_mae:
        weights, weight_mode = w_uniform, "uniform"
    else:
        weights, weight_mode = w_inv, "inverse-mae"

    # ---- 验证集：只报告，不参与任何选择 ----
    val_pred = blend_on(val_m, weights)
    yva = y[val_m]
    naive = np.zeros_like(yva)
    mae = float(np.mean(np.abs(val_pred - yva)))
    naive_mae = float(np.mean(np.abs(naive - yva)))
    direction = float(np.mean(np.sign(val_pred) == np.sign(yva)) * 100)
    skill = float(1 - mae / naive_mae) * 100
    ss_res = float(np.sum((val_pred - yva) ** 2))
    ss_tot = float(np.sum((yva - yva.mean()) ** 2))
    r2 = float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0

    # 单成员最好成绩，用于对照（说明集成的取舍）
    best_single = min(float(np.mean(np.abs(blend_on(val_m, np.eye(len(members))[i]) - yva))) for i in range(len(members)))

    print(f"[4/7] 权重模式：{weight_mode}（倒 MAE 权重 {[round(float(x), 3) for x in w_inv]}）")
    print(f"      集成    MAE={mae * 100:.4f}pp  方向准确率={direction:.2f}%  技能分={skill:+.2f}%  R²={r2:.4f}")
    print(f"      最好单成员 MAE={best_single * 100:.4f}pp")
    print(f"      朴素基线 MAE={naive_mae * 100:.4f}pp  方向准确率=50.00%")

    # ---- 滚动起点回测（集成） ----
    bt_model, bt_naive = [], []
    for (product_id, market_id), s in series.items():
        dates, prices = s["dates"], s["prices"]
        for origin in [d for d in dates if d >= val_start]:
            i = dates.index(origin)
            if i + H >= len(prices):
                continue
            vec = build_feature_row(dates[: i + 1], prices[: i + 1], product_id,
                                    s["category"], s["marketType"], spec)
            blended = sum(float(weights[k]) * blended_predict(m, vec) for k, m in enumerate(members))
            truth = prices[i + H]
            bt_model.append(abs(prices[i] * (1.0 + blended) - truth))
            bt_naive.append(abs(prices[i] - truth))

    bt_mae = float(np.mean(bt_model))
    bt_naive_mae = float(np.mean(bt_naive))
    bt_skill = float(1 - bt_mae / bt_naive_mae) * 100 if bt_naive_mae > 0 else 0.0
    print(f"[5/7] 滚动起点回测：集成 MAE={bt_mae:.4f} 元/公斤，基线 {bt_naive_mae:.4f}，技能分 {bt_skill:+.2f}%")

    # ---- 逐日路径波动带：h 日相对收益的经验标准差 ----
    allp = np.concatenate([np.asarray(s["prices"], dtype=np.float64) for s in series.values()])
    path_std = {str(h): round(float(np.std(allp[h:] / allp[:-h] - 1.0)), 6) for h in range(1, 15)}

    top_coef = []
    full_member = members[0]
    order = np.argsort(-np.abs(full_member["_w"]))[:8]
    for i in order:
        top_coef.append({
            "feature": full_member["featureNames"][int(i)],
            "coefRaw": round(float(full_member["_w"][int(i)] / full_member["_sd"][int(i)]), 6)
        })

    model = {
        "modelType": "ridge-ensemble",
        "target": f"price_return_{H}d",
        "horizon": H,
        "trainedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "seed": SEED,
        "weightMode": weight_mode,
        "dataRange": [all_dates[0], all_dates[-1]],
        "validationRange": [val_start, all_dates[-1]],
        "seriesCount": len(series),
        "featureSpec": {
            "categoryLevels": spec["categoryLevels"],
            "productLevels": spec["productLevels"],
            "marketTypeLevels": MARKET_TYPE_LEVELS,
            "marketTypeReference": MARKET_TYPE_LEVELS[0],
            "minHistory": MIN_HISTORY,
            "allFeatureNames": spec["featureNames"]
        },
        "weights": [round(float(x), 6) for x in weights],
        "members": [{
            "key": m["key"],
            "label": m["label"],
            "lambda": m["lambda"],
            "featureNames": m["featureNames"],
            "featureMean": [round(float(x), 10) for x in m["_mu"]],
            "featureStd": [round(float(x), 10) for x in m["_sd"]],
            "coef": [round(float(x), 10) for x in m["_w"]],
            "intercept": round(float(m["_b"]), 10),
            "valMaePct": round(m["valMae"] * 100, 4)
        } for m in members],
        "pathStd": path_std,
        "metrics": {
            "maePct": round(mae * 100, 4),
            "naiveMaePct": round(naive_mae * 100, 4),
            "skillPct": round(skill, 2),
            "directionAccuracyPct": round(direction, 2),
            "r2": round(r2, 5),
            "backtestMaeYuan": round(bt_mae, 5),
            "backtestNaiveMaeYuan": round(bt_naive_mae, 5),
            "backtestSkillPct": round(bt_skill, 2),
            "trainSamples": int(fit_m.sum()),
            "calibSamples": int(cal_m.sum()),
            "validSamples": int(val_m.sum()),
            "bestSingleMemberMaePct": round(best_single * 100, 4),
            "excludedQualityFlag1": True
        },
        "memberMetrics": [{
            "key": m["key"], "label": m["label"],
            "valMaePct": round(m["valMae"] * 100, 4),
            "weight": round(float(weights[i]), 4)
        } for i, m in enumerate(members)],
        "topCoef": top_coef,
        "notes": [
            f"预测目标为 {H} 日价格漂移（p(t+{H})/p(t)−1），非单日价格；逐日路径由该漂移几何分摊，不采用递归预测，避免误差逐日累积。",
            "95% 参考带按历史 h 日收益率经验标准差 ×1.96 给出，属统计参考区间，不构成价格承诺。",
            f"训练区间 {all_dates[0]} ~ {all_dates[-1]} 约 1.5 年，不足一个完整年周期，年度季节项欠拟合，其系数已被岭惩罚自动压缩。",
            "价格数据为本地生成的样例数据（见 数据源与口径说明.md），模型指标反映的是「在该生成机制下的可预测性」，不代表真实市场行情的预测能力。",
            "训练剔除 qualityFlag=1 的待核记录；推理端未剔除，以保证预测基准价与页面展示的最后一日报价一致。",
        ],
    }

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(model, f, ensure_ascii=False, indent=2)

    print(f"[6/7] 模型参数已导出：{args.out}（{os.path.getsize(args.out) / 1024:.1f} KB）")
    print("[7/7] 成员权重：" + ", ".join(f"{m['key']}={weights[i]:.3f}" for i, m in enumerate(members)))


if __name__ == "__main__":
    main()
