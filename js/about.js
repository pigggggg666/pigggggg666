// ===== 项目介绍页：用真实数据填充项目速览 =====
(function () {
  function el(id) { return document.getElementById(id); }
  function pct(x, n) { return (Number(x) * 100).toFixed(n == null ? 1 : n); }

  function load(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("load fail: " + url);
      return r.json();
    });
  }

  Promise.all([load("data/statistic_result.json"), load("data/model_metrics.json")])
    .then(function (res) {
      var d = res[0];
      var m = res[1] || {};
      var desc = d.desc || {};
      var time = d.time || {};
      var hot = d.hot || {};
      var ravg = desc.room_avg_usage || {};

      if (el("abRecs")) el("abRecs").textContent = Number(desc.total_records).toLocaleString();
      if (el("abRooms")) el("abRooms").textContent = desc.room_count;
      if (el("abAvg")) el("abAvg").textContent = pct(desc.usage_rate_stats.mean) + "%";

      var peaks = (time.peak_hours || []).slice().sort(function (a, b) { return a - b; });
      if (el("abPeak")) el("abPeak").textContent = peaks.map(function (h) { return h + "时"; }).join(" · ");

      var mm = (m.test_dec || {});
      var mmKeys = Object.keys(mm);
      // 与 prediction 页同一口径：按展示精度（2 位小数）对齐 R²，数值相同判为并列最优
      var r2Shown = {};
      var bestR2v = null;
      mmKeys.forEach(function (k) {
        r2Shown[k] = Math.round(Number(mm[k].r2) * 100) / 100;
        if (bestR2v === null || r2Shown[k] > bestR2v) bestR2v = r2Shown[k];
      });
      var bestR2Keys = mmKeys.filter(function (k) { return r2Shown[k] === bestR2v; });
      if (el("abR2") && bestR2Keys.length) {
        var abNameMap = {
          LinearRegression: "线性回归",
          Ridge: "岭回归",
          RandomForest: "随机森林",
          HistGB: "梯度提升"
        };
        var abNames = bestR2Keys.map(function (k) { return abNameMap[k] || k; });
        el("abR2").innerHTML = "≈" + Number(mm[bestR2Keys[0]].r2).toFixed(2) +
          "（" + abNames.join(" / ") + "）";
      }

      if (el("abSummaryQuote")) {
        var topRoom = (hot.top5_hot_room && hot.top5_hot_room[0]) || null;
        var topMean = topRoom && ravg[topRoom] != null ? pct(ravg[topRoom]) : null;
        el("abSummaryQuote").innerHTML =
          "💡 <b>结论：</b>" + (d.summary || "") +
          (topRoom ? " 平均使用率最高的自习室为 <b>" + topRoom + " 号</b>" +
            (topMean ? "（约 " + topMean + "%）" : "") + "。" : "");
      }
    })
    .catch(function (e) {
      console.warn("项目介绍速览数据加载失败，保留默认文案", e);
      if (el("abSummaryQuote")) {
        el("abSummaryQuote").innerHTML = "💡 共 46 间自习室，整体平均使用率约 29%，高峰时段集中于 0 时与 20–21 时。";
      }
    });
})();
