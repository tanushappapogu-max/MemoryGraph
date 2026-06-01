(function () {
  function createMemoryGraphWidget(options) {
    var baseUrl = (options && options.baseUrl) || "http://127.0.0.1:3033";
    var target = (options && options.target && document.querySelector(options.target)) || document.body;
    var panel = document.createElement("div");
    panel.style.cssText = [
      "position:fixed",
      "right:18px",
      "bottom:18px",
      "width:360px",
      "max-width:calc(100vw - 36px)",
      "z-index:2147483647",
      "background:#111318",
      "color:white",
      "border:1px solid rgba(255,255,255,.12)",
      "border-radius:10px",
      "box-shadow:0 18px 60px rgba(0,0,0,.25)",
      "font:14px system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "overflow:hidden"
    ].join(";");

    panel.innerHTML =
      '<div style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.1);display:flex;justify-content:space-between;gap:12px;align-items:center">' +
      '<strong>MemoryGraph Live</strong><span data-mg-confidence style="color:#31C48D;font-size:12px">idle</span></div>' +
      '<div data-mg-body style="padding:14px;color:rgba(255,255,255,.72);line-height:1.5">Waiting for call dialogue...</div>';

    target.appendChild(panel);
    var body = panel.querySelector("[data-mg-body]");
    var confidence = panel.querySelector("[data-mg-confidence]");

    async function update(dialogue) {
      if (!dialogue || dialogue.trim().length < 3) return;
      confidence.textContent = "thinking";
      var response = await fetch(baseUrl.replace(/\\/$/, "") + "/api/v1/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dialogue: dialogue })
      });
      var data = await response.json();
      confidence.textContent = (data.confidence || 0) + "%";
      body.innerHTML =
        '<div style="color:white;font-weight:700;margin-bottom:8px">' +
        escapeHtml(data.matchedPerson ? data.matchedPerson.name : "No match") +
        "</div>" +
        '<div style="margin-bottom:10px">' + escapeHtml(data.answer || "No answer.") + "</div>" +
        '<div style="font-size:12px;color:#31C48D">' +
        escapeHtml((data.heatPoints || []).map(function (p) { return p.name + " " + p.heatScore + "x"; }).join(" · ")) +
        "</div>";
      return data;
    }

    async function capture(text, source) {
      if (!text || text.trim().length < 8) return;
      var response = await fetch(baseUrl.replace(/\\/$/, "") + "/api/v1/capture/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, source: source || "browser", title: "Browser widget capture" })
      });
      return response.json();
    }

    return { update: update, capture: capture, element: panel };
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
    });
  }

  window.MemoryGraphWidget = { create: createMemoryGraphWidget };
})();
