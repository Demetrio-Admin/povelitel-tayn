// Small road-only graph, built once on demand. Retirement never removes a visible walker.
export function outsideCamera(bounds, view, margin = 0) {
  return bounds.x + bounds.width < view.x - margin || bounds.x > view.x + view.width + margin
    || bounds.y + bounds.height < view.y - margin || bounds.y > view.y + view.height + margin;
}

export function routeFromPoints(points) {
  const pts = points.map(p => [p.x, p.y]), cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i-1] + Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]));
  return { id: 'city_exit', pts, cum, len: cum.at(-1), w: 80 };
}

export function buildStreetGraph(routes, sample, blocked = () => false) {
  const nodes = [];
  const clear = (a, b) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x-a.x, b.y-a.y) / 16));
    for (let i = 0; i <= steps; i++) if (blocked(a.x+(b.x-a.x)*i/steps, a.y+(b.y-a.y)*i/steps)) return false;
    return true;
  };
  const link = (a, b) => {
    if (!clear(a, b)) return;
    const d = Math.hypot(b.x-a.x, b.y-a.y);
    a.edges.push({ to: b.index, d }); b.edges.push({ to: a.index, d });
  };
  for (const route of routes) {
    const n = Math.ceil(route.len / 40);
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const p = sample(route, route.len*i/n);
      if (blocked(p.x, p.y)) { prev = null; continue; }
      const node = { x: p.x, y: p.y, route, index: nodes.length, edges: [] };
      nodes.push(node);
      if (prev) link(prev, node);
      prev = node;
    }
  }
  // Join nearby road centers at junctions, only across clear pavement.
  for (let i = 0; i < nodes.length; i++) for (let j = i+1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    if (a.route === b.route) continue;
    const radius = Math.min(96, (a.route.w+b.route.w)/2-12);
    if (Math.abs(a.x-b.x) <= radius && Math.abs(a.y-b.y) <= radius && Math.hypot(a.x-b.x, a.y-b.y) <= radius) link(a, b);
  }
  return { nodes, clear };
}

/** Shortest reachable road path past the camera; null means keep walking, never fade. */
export function planStreetExit(graph, from, view, margin = 170) {
  const { nodes, clear } = graph;
  const dist = new Float64Array(nodes.length).fill(Infinity);
  const parent = new Int32Array(nodes.length).fill(-1), visited = new Uint8Array(nodes.length);
  for (const n of nodes) {
    const d = Math.hypot(n.x-from.x, n.y-from.y);
    if (d <= 100 && clear(from, n)) dist[n.index] = d;
  }
  for (let step = 0; step < nodes.length; step++) {
    let best = -1, cost = Infinity;
    for (let i = 0; i < nodes.length; i++) if (!visited[i] && dist[i] < cost) { best = i; cost = dist[i]; }
    if (best < 0) break;
    const node = nodes[best];
    if (outsideCamera({ ...node, width: 0, height: 0 }, view, margin)) {
      const points = [];
      for (let i = best; i >= 0; i = parent[i]) points.push({ x: nodes[i].x, y: nodes[i].y });
      return [from, ...points.reverse()].filter((p, i, all) => !i || Math.hypot(p.x-all[i-1].x, p.y-all[i-1].y) > 0.1);
    }
    visited[best] = 1;
    for (const e of node.edges) if (cost+e.d < dist[e.to]) { dist[e.to] = cost+e.d; parent[e.to] = best; }
  }
  return null;
}
