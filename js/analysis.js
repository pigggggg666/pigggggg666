// ===== 分析结果：聚类分布 / 热门排行 / 自习室明细 / 相关性 =====
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
  var clusterChart = initChart("clusterChart");
  var topBarChart = initChart("topBarChart");
  var corrChart = initChart("corrChart");

  var LEVELS = {
    1: { name: "空闲", color: "#10b981", advice: "多数时段有空位，可直接前往" },
    2: { name: "正常", color: "#3b82f6", advice: "偶有满座，高峰期建议错峰" },
    3: { name: "热门", color: "#f59e0b", advice: "高峰期较挤，建议提前规划" },
    4: { name: "爆满", color: "#ef4444", advice: "常年抢手，务必提前预约" }
  };
  function levelOf(mean) {
    if (mean >= 0.4) return 4;
    if (mean >= 0.3) return 3;
    if (mean >= 0.2) return 2;
    return 1;
  }

  // ---------- 房间目录（分页）状态 ----------
  var allRooms = [];
  var curRooms = [];
  var page = 1;
  var pageSize = 10;

  fetch("data/statistic_result.json")
    .then(function (r) { if (!r.ok) throw new Error("load fail"); return r.json(); })
    .then(render)
    .catch(function (e) {
      console.error("统计数据加载失败", e);
      ["clusterChart", "topBarChart", "corrChart"].forEach(function (id) {
        var d = el(id);
        if (d) d.innerHTML = '<div class="state"><span class="big">⚠️</span><span>数据加载失败</span></div>';
      });
    });

  function render(d) {
    // ---- 摘要 ----
    if (el("aSummaryWrap")) {
      el("aSummaryWrap").innerHTML = "💡 <b>一句话摘要：</b>" +
        (d.summary || "共 46 间自习室，整体平均使用率约 29%，高峰时段集中。") +
        "（统计结果由算法组基于 2024 全年真实预约记录产出）";
    }

    var hot = d.hot || {};
    var rank = hot.room_hot_rank || {};
    var ravg = (d.desc && d.desc.room_avg_usage) || {};
    allRooms = Object.keys(rank).map(function (room) {
      var mean = rank[room] && rank[room].mean != null ? Number(rank[room].mean) : (ravg[room] != null ? Number(ravg[room]) : 0);
      var max = rank[room] && rank[room].max != null ? Number(rank[room].max) : null;
      var cnt = rank[room] && rank[room].count != null ? Number(rank[room].count) : null;
      return { room: room, mean: mean, max: max, count: cnt, lvl: levelOf(mean) };
    }).sort(function (a, b) { return b.mean - a.mean; });

    // ---- 聚类分布 ----
    drawCluster(allRooms);
    // ---- 热门 TOP10 ----
    drawTopBar(allRooms);
    // ---- 明细表 ----
    curRooms = allRooms.slice();
    bindTable();
    renderTable();
    // ---- 相关性 ----
    drawCorr(d.corr || {});
  }

  // ---- 热度等级环形图 ----
  function drawCluster(rooms) {
    if (!clusterChart) return;
    var dist = { 1: 0, 2: 0, 3: 0, 4: 0 };
    rooms.forEach(function (r) { dist[r.lvl]++; });
    var total = rooms.length;
    var pieData = [1, 2, 3, 4].map(function (lvl) {
      return { name: LEVELS[lvl].name + "（" + dist[lvl] + "）", value: dist[lvl], itemStyle: { color: LEVELS[lvl].color } };
    });
    clusterChart.setOption({
      tooltip: { trigger: "item", formatter: "{b}<br>房间数 {c} · 占比 {d}%" },
      legend: { bottom: 0, icon: "circle" },
      color: [1, 2, 3, 4].map(function (l) { return LEVELS[l].color; }),
      series: [{
        name: "热度等级",
        type: "pie",
        radius: ["46%", "70%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
        label: { formatter: "{b}", fontSize: 12 },
        data: pieData
      }]
    });

    // 右侧速览
    var html = "";
    [1, 2, 3, 4].forEach(function (l) {
      var c = dist[l];
      html += "<p class='mini-note'><span class='badge iv" + l + "'>" + LEVELS[l].name + "</span> " +
        "<b>" + c + "</b> 间 · 占 " + (c / total * 100).toFixed(0) + "%</p>";
    });
    if (el("lvlStats")) el("lvlStats").innerHTML = html;
    el("lvlStats").classList.remove("loading");
  }

  // ---- 热门 TOP10 条形图 ----
  function drawTopBar(rooms) {
    if (!topBarChart) return;
    var top = rooms.slice(0, 10).slice().reverse();
    var first = rooms[0];
    if (el("firstRoom")) {
      el("firstRoom").textContent = first ? first.room + " 号" : "—";
    }
    if (el("firstRoomVal")) el("firstRoomVal").textContent = first ? pct(first.mean) + "%" : "—";
    if (el("firstRoomLvl")) {
      var f = LEVELS[first.lvl];
      el("firstRoomLvl").textContent = "「" + (f ? f.name : "") + "」";
    }
    topBarChart.setOption({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: function (ps) {
          var p = ps[0];
          return "<b>" + p.name + "</b><br>平均使用率 <b>" + p.value + "%</b>";
        }
      },
      grid: { left: 14, right: 44, top: 8, bottom: 6, containLabel: true },
      xAxis: {
        type: "value",
        axisLabel: { formatter: "{value}%", color: "#64748b" },
        splitLine: { lineStyle: { color: "#eef2f7" } }
      },
      yAxis: {
        type: "category",
        data: top.map(function (r) { return r.room; }),
        axisLabel: { color: "#334155", fontWeight: 600 },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      series: [{
        type: "bar",
        barWidth: 16,
        data: top.map(function (r) {
          return {
            value: pct(r.mean),
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: "#93c5fd" },
                { offset: 1, color: "#2563eb" }
              ]),
              borderRadius: [0, 8, 8, 0]
            }
          };
        }),
        label: {
          show: true,
          position: "right",
          formatter: "{c}%",
          color: "#64748b",
          fontSize: 11
        }
      }]
    });
  }
  // ---- 明细表：筛选 + 分页 ----
  function applyFilter() {
    var v = el("levelFilter").value;
    curRooms = v === "all" ? allRooms.slice() : allRooms.filter(function (r) { return String(r.lvl) === v; });
    page = 1;
    renderTable();
  }

  function renderTable() {
    var body = el("roomTableBody");
    if (!body) return;
    if (!curRooms.length) {
      body.innerHTML = "<tr><td colspan='7' style='text-align:center;color:#94a3b8;'>没有符合条件的自习室</td></tr>";
      return;
    }
    var totalPage = Math.ceil(curRooms.length / pageSize);
    if (page > totalPage) page = totalPage;
    var start = (page - 1) * pageSize;
    var slice = curRooms.slice(start, start + pageSize);
    var rows = slice.map(function (r, i) {
      var lvl = LEVELS[r.lvl];
      return "<tr>" +
        "<td>" + (start + i + 1) + "</td>" +
        "<td><b>" + r.room + "</b></td>" +
        "<td class='num'><b>" + pct(r.mean) + "%</b></td>" +
        "<td class='num'>" + (r.max != null ? pct(r.max, 0) + "%" : "—") + "</td>" +
        "<td class='num'>" + (r.count != null ? Number(r.count).toLocaleString() : "—") + "</td>" +
        "<td><span class='badge iv" + r.lvl + "'>" + lvl.name + "</span></td>" +
        "<td style='font-size:13px;color:#64748b;'>" + lvl.advice + "</td>" +
        "</tr>";
    }).join("");
    body.innerHTML = rows;
    if (el("pageInfo")) el("pageInfo").textContent = "第 " + page + " / " + totalPage + " 页 · 共 " + curRooms.length + " 间";
    var prev = el("prevPage"), next = el("nextPage");
    if (prev) prev.disabled = page <= 1;
    if (next) next.disabled = page >= totalPage;
  }

  function bindTable() {
    var filter = el("levelFilter");
    if (filter) filter.addEventListener("change", applyFilter);
    var prev = el("prevPage"), next = el("nextPage");
    if (prev) prev.addEventListener("click", function () { if (page > 1) { page--; renderTable(); } });
    if (next) next.addEventListener("click", function () {
      if (page < Math.ceil(curRooms.length / pageSize)) { page++; renderTable(); }
    });
  }

  // ---- 相关性热力图 ----
  function drawCorr(corr) {
    if (!corrChart) return;
    var order = ["seat_total", "hour", "weekday", "usage_rate"];
    var labels = { seat_total: "座位总数", hour: "开始小时", weekday: "星期几", usage_rate: "使用率" };
    var matrix = order.map(function (row) {
      return order.map(function (col) {
        var v = corr[row] && corr[row][col] != null ? Number(corr[row][col]) : null;
        return v;
      });
    });
    var cellData = [];
    order.forEach(function (row, i) {
      order.forEach(function (col, j) {
        cellData.push([j, i, matrix[i][j]]);
      });
    });
    if (el("c1")) el("c1").textContent = fmtCorr(corr.seat_total && corr.seat_total.usage_rate);
    if (el("c2")) el("c2").textContent = fmtCorr(corr.hour && corr.hour.usage_rate);
    if (el("c3")) el("c3").textContent = fmtCorr(corr.weekday && corr.weekday.usage_rate);

    corrChart.setOption({
      tooltip: {
        position: "top",
        formatter: function (p) {
          return labels[order[p.data[0]]] + " × " + labels[order[p.data[1]]] +
            "<br>相关系数 <b>" + (p.data[2] == null ? "—" : Number(p.data[2]).toFixed(3)) + "</b>";
        }
      },
      grid: { left: 10, right: 16, top: 10, bottom: 40, containLabel: true },
      xAxis: { type: "category", data: order.map(function (k) { return labels[k]; }), splitArea: { show: true } },
      yAxis: { type: "category", data: order.map(function (k) { return labels[k]; }), splitArea: { show: true } },
      visualMap: {
        min: -0.4,
        max: 1,
        calculable: false,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        textStyle: { color: "#64748b" },
        inRange: {
          color: ["#ef4444", "#ffffff", "#2563eb"]
        }
      },
      series: [{
        type: "heatmap",
        data: cellData,
        label: {
          show: true,
          fontSize: 11,
          color: "#334155",
          formatter: function (p) { return Number(p.data[2]).toFixed(2); }
        },
        itemStyle: { borderColor: "#fff", borderWidth: 2 },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,.2)" } }
      }]
    });
  }

  function fmtCorr(v) {
    if (v == null) return "—";
    var n = Number(v);
    return (n > 0 ? "+" : "") + n.toFixed(2);
  }

  window.addEventListener("resize", function () {
    charts.forEach(function (c) { c.resize(); });
  });
})();
