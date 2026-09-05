// ===== 预测展示：真实 vs 四模型预测 + 模型指标 =====
(function () {
  var trendChart = null;
  var indexData = null;
  var roomPayload = null;
  var metricsLoaded = false;

  function el(id) { return document.getElementById(id); }
  function pct(x, n) { return (Number(x) * 100).toFixed(n == null ? 1 : n); }
  function crowdOf(rate) {
    if (rate >= 0.5) return { lvl: 4, name: "爆满" };
    if (rate >= 0.35) return { lvl: 3, name: "热门" };
    if (rate >= 0.2) return { lvl: 2, name: "适中" };
    return { lvl: 1, name: "空闲" };
  }

  var SERIES = [
    { key: "true", name: "真实使用率", color: "#111827", solid: true },
    { key: "linear", name: "线性回归", color: "#3b82f6", solid: false },
    { key: "ridge", name: "岭回归", color: "#10b981", solid: false },
    { key: "rf", name: "随机森林", color: "#ef4444", solid: false },
    { key: "histgb", name: "梯度提升", color: "#f59e0b", solid: false }
  ];
  var HOURS = [];
  for (var h = 0; h < 24; h++) HOURS.push(h + "时");

  var roomDates = {}; // room -> [dates]

  // ===== 初始化 =====
  fetch("data/predictions/predictions_index.json")
    .then(function (r) { if (!r.ok) throw new Error("索引读取失败"); return r.json(); })
    .then(function (d) {
      indexData = d;
      fillRoomSelect();
    })
    .catch(function (e) {
      console.error("索引读取失败", e);
      var t = el("roomSelect");
      if (t) t.innerHTML = "<option>—</option>";
    });

  function fillRoomSelect() {
    var roomSel = el("roomSelect");
    roomSel.innerHTML = "";
    var list = indexData.rooms || [];
    list.forEach(function (item) {
      var opt = document.createElement("option");
      opt.value = item.room;
      opt.textContent = "房间 " + item.room;
      roomSel.appendChild(opt);
      roomDates[item.room] = item.dates || [];
    });
    roomSel.addEventListener("change", function () {
      fillDateSelect(roomSel.value, true);
    });
    fillDateSelect(roomSel.value, true);
  }

  function fillDateSelect(room, load) {
    var dateSel = el("dateSelect");
    var dates = (roomDates[room] || []).slice();
    dateSel.innerHTML = "";
    if (!dates.length) {
      var opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "—";
      dateSel.appendChild(opt);
    }
    dates.forEach(function (d) {
      var opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      dateSel.appendChild(opt);
    });
    if (load) loadRoom();
  }

  function loadRoom() {
    var room = el("roomSelect").value;
    if (!room) return;
    fetch("data/predictions/by_room/" + room + ".json")
      .then(function (r) { if (!r.ok) throw new Error("房间数据读取失败"); return r.json(); })
      .then(function (d) {
        roomPayload = d;
        // 兜底：索引中没有日期时，使用数据文件内日期
        if (!(roomDates[room] || []).length) {
          roomDates[room] = Object.keys((d.data || {})).sort();
          fillDateSelect(room, false);
        }
        renderTrend();
        loadMetrics();
      })
      .catch(function (e) { console.error("房间数据读取失败", e); });
  }
  // ===== 渲染曲线与拥挤度 Top3 =====
  function renderTrend() {
    if (!roomPayload) return;
    var room = el("roomSelect").value;
    var date = el("dateSelect").value;
    var day = roomPayload.data[date];
    if (!day) {
      if (el("crowdTop")) {
        el("crowdTop").classList.remove("loading");
        el("crowdTop").innerHTML = "<p class='mini-note'>该自习室当日无预测数据</p>";
      }
      return;
    }

    var rows = {};
    SERIES.forEach(function (s) { rows[s.key] = []; });
    var ridgeTop = [];
    for (var hh = 0; hh < 24; hh++) {
      var p = day[hh] || {};
      SERIES.forEach(function (s) {
        var v = p[s.key];
        rows[s.key].push(v === undefined || v === null ? null : Number(v));
      });
      var rv = p.ridge;
      if (rv !== undefined && rv !== null) ridgeTop.push({ h: hh, v: Number(rv) });
    }
    ridgeTop.sort(function (a, b) { return b.v - a.v; });

    // 拥挤度 Top3
    var topEl = el("crowdTop");
    if (topEl) {
      topEl.classList.remove("loading");
      var cTop = ridgeTop.slice(0, 3);
      if (!cTop.length) {
        topEl.innerHTML = "<p class='mini-note'>无预测数据</p>";
      } else {
        topEl.innerHTML = cTop.map(function (o) {
          var c = crowdOf(o.v);
          return "<p class='mini-note' style='display:flex;justify-content:space-between;align-items:center;margin:8px 0;'>" +
            "<span><b>" + o.h + " 时</b></span>" +
            "<span><span class='badge cv" + c.lvl + "'>" + c.name + "</span> &nbsp;预测 " + pct(o.v) + "%</span></p>";
        }).join("");
      }
    }

    if (!trendChart) {
      var dom = el("trendChart");
      if (!dom) return;
      trendChart = echarts.init(dom);
    }

    var series = SERIES.map(function (s) {
      var isTrue = s.key === "true";
      return {
        name: s.name,
        type: "line",
        smooth: true,
        showSymbol: false,
        data: rows[s.key],
        lineStyle: { width: isTrue ? 3.5 : 2, type: isTrue ? "solid" : "dashed" },
        itemStyle: { color: s.color },
        areaStyle: isTrue ? { opacity: 0.06 } : undefined,
        emphasis: { focus: "series" }
      };
    });

    trendChart.setOption({
      tooltip: {
        trigger: "axis",
        formatter: function (ps) {
          var html = "<b>" + date + " · " + ps[0].name + "</b><br/>房间 " + room;
          ps.forEach(function (p) {
            if (p.value == null) return;
            html += "<br/>" + p.marker + " " + p.seriesName + "：<b>" + pct(p.value) + "%</b>";
          });
          return html;
        }
      },
      legend: { top: 0, type: "scroll", textStyle: { fontSize: 12 } },
      grid: { left: 10, right: 16, top: 42, bottom: 6, containLabel: true },
      xAxis: { type: "category", data: HOURS, axisLabel: { color: "#64748b" } },
      yAxis: {
        type: "value",
        min: 0,
        max: 1,
        interval: 0.2,
        axisLabel: { formatter: function (v) { return (v * 100).toFixed(0) + "%"; }, color: "#64748b" },
        splitLine: { lineStyle: { color: "#eef2f7" } }
      },
      series: series
    });
  }

  // ===== 模型指标 =====
  function loadMetrics() {
    if (metricsLoaded) return;
    metricsLoaded = true;
    fetch("data/model_metrics.json")
      .then(function (r) { if (!r.ok) throw new Error("指标读取失败"); return r.json(); })
      .then(function (d) { renderMetrics(d); })
      .catch(function (e) { metricsLoaded = false; console.error("指标读取失败", e); });
  }

  function renderMetrics(d) {
    var m = d.test_dec || {};
    var nameMap = {
      LinearRegression: "线性回归",
      Ridge: "岭回归",
      RandomForest: "随机森林",
      HistGB: "梯度提升"
    };
    var typeMap = {
      LinearRegression: "多元线性",
      Ridge: "L2 正则线性",
      RandomForest: "决策树集成",
      HistGB: "梯度提升树"
    };
    var keys = Object.keys(m);
    if (el("mSamples") && m.LinearRegression) {
      el("mSamples").textContent = Number(m.LinearRegression.samples).toLocaleString();
    }
    if (el("mRooms")) el("mRooms").textContent = (indexData && indexData.rooms ? indexData.rooms.length : "46");

    // 评价判定：按表格展示精度（4 位小数）对齐 R²，数值相同的模型判为并列最优。
    // 线性回归(0.41444) 与岭回归(0.414431) 四位小数均为 0.4144，应得到相同的“评价”，
    // 不能因第 5 位微小差异一个标“最优”、一个标“一般”。
    var r2Shown = {};
    var bestR2v = null;
    keys.forEach(function (k) {
      r2Shown[k] = Math.round(Number(m[k].r2) * 10000) / 10000;
      if (bestR2v === null || r2Shown[k] > bestR2v) bestR2v = r2Shown[k];
    });
    var bestKeys = keys.filter(function (k) { return r2Shown[k] === bestR2v; });
    var bestNames = bestKeys.map(function (k) { return nameMap[k] || k; });
    if (el("mBestR2") && bestKeys.length) {
      el("mBestR2").innerHTML = bestNames.join(" / ") + " · R²=" + Number(m[bestKeys[0]].r2).toFixed(3);
    }

    var body = el("metricsBody");
    body.innerHTML = keys.map(function (k) {
      var isBest = bestKeys.indexOf(k) !== -1;
      var flag = isBest
        ? "<span class='badge best'>" + (bestKeys.length > 1 ? "并列最优" : "最优") + "</span>"
        : "<span class='badge gray'>一般</span>";
      return "<tr>" +
        "<td><b>" + (nameMap[k] || k) + "</b></td>" +
        "<td>" + (typeMap[k] || "回归") + "</td>" +
        "<td class='num'>" + Number(m[k].rmse).toFixed(4) + "</td>" +
        "<td class='num'>" + Number(m[k].mae).toFixed(4) + "</td>" +
        "<td class='num'>" + Number(m[k].r2).toFixed(4) + "</td>" +
        "<td>" + flag + "</td></tr>";
    }).join("");
  }

  var dateSel = el("dateSelect");
  if (dateSel) dateSel.addEventListener("change", renderTrend);

  window.addEventListener("resize", function () { if (trendChart) trendChart.resize(); });
})();
