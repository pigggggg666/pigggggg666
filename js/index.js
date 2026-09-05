// 首页：用真实统计结果更新数据速览卡片（读取失败时保留页面默认值）
(function () {
  fetch("data/statistic_result.json")
    .then(function (r) { if (!r.ok) throw new Error("load fail"); return r.json(); })
    .then(function (d) {
      var desc = (d && d.desc) || {};
      var el = function (id) { return document.getElementById(id); };

      if (desc.total_records != null && el("sRecords")) {
        el("sRecords").innerHTML = Number(desc.total_records).toLocaleString() + "<small> 条</small>";
      }
      if (desc.room_count != null && el("sRooms")) {
        el("sRooms").textContent = desc.room_count;
      }
      if (desc.usage_rate_stats && desc.usage_rate_stats.mean != null && el("sAvg")) {
        el("sAvg").innerHTML = (desc.usage_rate_stats.mean * 100).toFixed(2) + "<small>%</small>";
      }
    })
    .catch(function (e) { console.warn("首页速览数据加载失败，使用默认值", e); });
})();
