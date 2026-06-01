const baseUrl = process.env.MEMORYGRAPH_URL || "http://127.0.0.1:3033";

async function main() {
  const health = await request("/api/health");
  console.log("health", health.ok, health.counts);

  const live = await request("/api/v1/live", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dialogue: "Alex asked if the new hardware delay affects the roadmap." }),
  });

  console.log("matched", live.matchedPerson?.name);
  console.log("confidence", live.confidence);
  console.log("heat", live.heatPoints.map((point: { name: string; heatScore: number }) => `${point.name}:${point.heatScore}x`).join(", "));
  console.log("answer", live.answer);

  if (live.matchedPerson?.name !== "Alex Rivera") {
    throw new Error("Expected live endpoint to match Alex Rivera.");
  }
  if (!live.heatPoints.some((point: { name: string }) => point.name === "hardware")) {
    throw new Error("Expected live endpoint to return hardware heat point.");
  }
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  const payload = JSON.parse(text);
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || text);
  }
  return payload;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
