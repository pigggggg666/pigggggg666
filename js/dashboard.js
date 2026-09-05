// ===== 数据看板：整体趋势 + 描述统计 =====
(function () {
  var charts = [];

  function el(id) { return document.getElementById(id); }
  function pct(x, n) { return (Number(x) * 100).toFixed(n == null ? 1 : n); }

  function initChart(id) {
    var dom = el(id);
    if (!dom) return null;
    var c = echarts.init(dom);
    charts.push(c);
    return c;
  }

  var hourChart = initChart("hourChart");
  var weekChart = initChart("weekChart");

  fetch("data/statistic_result.json")
    .then(function (r) { if (!r.ok) throw new Error("load fail"); return r.json(); })
    .then(render)
    .catch(function (e) {
      console.error("统计数据加载失败", e);
      document.querySelectorAll(".chart").forEach(function (c) {
        c.innerHTML = '<div class="state"><span class="big">⚠️</span><span>统计数据加载失败，请确认 data/statistic_result.json 可访问</span></div>';
      });
    });

  function render(d) {
    var desc = d.desc || {};
    var time = d.time || {};
    var hot = d.hot || {};
    var ravg = desc.room_avg_usage || {};

    // ---- KPI ----
    if (el("kRecords")) el("kRecords").textContent = Number(desc.total_records).toLocaleString();
    if (el("kRooms")) el("kRooms").textContent = desc.room_count;
    if (el("kAvg")) el("kAvg").innerHTML = pct(desc.usage_rate_stats.mean) + "<small>%</small>";
    if (el("kStd")) el("kStd").innerHTML = pct(desc.usage_rate_stats.std) + "<small>%</small>";

    var peaks = (time.peak_hours || []).slice();
    peaks.sort(function (a, b) { return a - b; });
    if (el("kPeak")) el("kPeak").textContent = peaks.map(function (h) { return h + "时"; }).join(" · ");

    var topRoom = (hot.top5_hot_room && hot.top5_hot_room[0]) || "—";
    var topVal = ravg[topRoom] != null ? Number(ravg[topRoom]) : null;
    if (el("kTop")) el("kTop").innerHTML = topRoom + (topVal != null ? " · " + pct(topVal, 1) + "%" : "");

    // ---- 描述统计表 ----
    fillStatTable(desc.usage_rate_stats);

    // ---- 冷热 / 周末结论 ----
    var hu = time.hour_usage || {};
    var hourArr = Object.keys(hu).map(function (h) { return { h: Number(h), v: Number(hu[h]) }; })
      .sort(function (a, b) { return a.v - b.v; });
    var top3 = hourArr.slice(-3).reverse();
    var low3 = hourArr.slice(0, 3);
    if (el("topHours")) el("topHours").textContent = top3.map(function (o) { return o.h + "时（" + pct(o.v) + "%）"; }).join(" · ");
    if (el("lowHours")) el("lowHours").textContent = low3.map(function (o) { return o.h + "时（" + pct(o.v) + "%）"; }).join(" · ");

    var wd = time.weekday_usage || {};
    var wkArr = Object.keys(wd).map(Number);
    var weekdayList = wkArr.filter(function (k) { return k >= 0 && k <= 4; });
    var weekendList = wkArr.filter(function (k) { return k >= 5; });
    function avgOf(keys) {
      if (!keys.length) return null;
      return keys.reduce(function (s, k) { return s + Number(wd[k]); }, 0) / keys.length;
    }
    var wAvg = avgOf(weekdayList), eAvg = avgOf(weekendList);
    if (el("weekdayAvg")) el("weekdayAvg").textContent = wAvg != null ? pct(wAvg) + "%" : "—";
    if (el("weekendAvg")) el("weekendAvg").textContent = eAvg != null ? pct(eAvg) + "%" : "—";
    if (el("meanVal")) el("meanVal").textContent = pct(desc.usage_rate_stats.mean) + "%";
    if (el("medVal")) el("medVal").textContent = pct(desc.usage_rate_stats["50%"], 0) + "%";

    // ---- 图表 ----
    drawHourChart(hu);
    drawWeekChart(wd);
  }

  function fillStatTable(stats) {
    var body = el("statBody");
    if (!body || !stats) return;
    var rows = [
      ["样本数量", Number(stats.count).toLocaleString(), "全部预约/时段样本"],
      ["平均值", pct(stats.mean) + "%", "整体平均使用率"],
      ["标准差", pct(stats.std) + "%", "使用率波动程度"],
      ["最小值", pct(stats.min) + "%", "无预约时的 0 占用"],
      ["25% 分位", pct(stats["25%"]) + "%", "四分位数下界"],
      ["中位数", pct(stats["50%"]) + "%", "一半样本低于该值"],
      ["75% 分位", pct(stats["75%"]) + "%", "四分位数上界"],
      ["最大值", pct(stats.max, 0) + "%", "某些热门时段接近满座"]
    ];
    body.innerHTML = rows.map(function (r) {
      return "<tr><td><b>" + r[0] + "</b></td><td class='num'><b>" + r[1] + "</b></td><td>" + r[2] + "</td></tr>";
    }).join("");
  }
  // ---- 24 小时曲线 ----
  function drawHourChart(hu) {
    if (!hourChart) return;
    var hours = Object.keys(hu).map(Number).sort(function (a, b) { return a - b; });
    var data = hours.map(function (h) { return Number((Number(hu[h]) * 100).toFixed(1)); });
    hourChart.setOption({
      tooltip: {
        trigger: "axis",
        formatter: function (ps) {
          var p = ps[0];
          return "<b>" + p.axisValue + "</b><br>平均使用率 <b>" + p.value + "%</b>";
        }
      },
      grid: { left: 14, right: 14, top: 30, bottom: 6, containLabel: true },
      xAxis: {
        type: "category",
        data: hours.map(function (h) { return h + "时"; }),
        axisLine: { lineStyle: { color: "#e2e8f0" } },
        axisLabel: { color: "#64748b" }
      },
      yAxis: {
        type: "value",
        max: 50,
        axisLabel: { formatter: "{value}%", color: "#64748b" },
        splitLine: { lineStyle: { color: "#eef2f7" } }
      },
      series: [{
        name: "平均使用率",
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        data: data,
        lineStyle: { width: 3, color: "#2563eb" },
        itemStyle: { color: "#2563eb" },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(37,99,235,.28)" },
            { offset: 1, color: "rgba(37,99,235,.02)" }
          ])
        },
        markPoint: {
          data: [
            { type: "max", name: "峰值", itemStyle: { color: "#ef4444" } },
            { type: "min", name: "谷值", itemStyle: { color: "#10b981" } }
          ],
          label: { fontSize: 11 }
        }
      }]
    });
  }

  // ---- 周柱状图 ----
  function drawWeekChart(wd) {
    if (!weekChart) return;
    var names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    var keys = [0, 1, 2, 3, 4, 5, 6].filter(function (k) { return wd[k] != null; });
    var data = keys.map(function (k) { return { v: Number((Number(wd[k]) * 100).toFixed(1)), weekend: k >= 5 }; });
    weekChart.setOption({
      tooltip: {
        trigger: "axis",
        formatter: function (ps) {
          var p = ps[0];
          return "<b>" + p.name + "</b><br>平均使用率 <b>" + p.value + "%</b>";
        }
      },
      grid: { left: 14, right: 14, top: 30, bottom: 6, containLabel: true },
      xAxis: {
        type: "category",
        data: names,
        axisLine: { lineStyle: { color: "#e2e8f0" } },
        axisLabel: { color: "#64748b" }
      },
      yAxis: {
        type: "value",
        max: 45,
        axisLabel: { formatter: "{value}%", color: "#64748b" },
        splitLine: { lineStyle: { color: "#eef2f7" } }
      },
      series: [{
        type: "bar",
        barWidth: "46%",
        data: data.map(function (d) {
          return {
            value: d.v,
            itemStyle: {
              borderRadius: [8, 8, 0, 0],
              color: d.weekend ? "#f59e0b" : "#2563eb"
            }
          };
        })
      }]
    });
  }

  window.addEventListener("resize", function () {
    charts.forEach(function (c) { c.resize(); });
  });
})();
