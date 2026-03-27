import {
  CLUSTER_GAP_MS,
  CLUSTER_MERGE_DISTANCE,
  CLUSTER_MERGE_GAP_MS,
  CLUSTER_NEIGHBOR_GAP_MS,
  CLUSTER_NEIGHBOR_RADIUS,
  CLUSTER_SPATIAL_RADIUS,
  CLUSTER_SPLIT_JUMP,
  CLUSTER_SPLIT_SPREAD,
  CLUSTER_TINY_SIZE,
  MAX_CLUSTER_SIZE,
} from "../config.js";

function computeVariance(values, mean) {
  if (!values.length) {
    return 0;
  }

  const total = values.reduce((sum, value) => {
    const delta = value - mean;
    return sum + delta * delta;
  }, 0);

  return total / values.length;
}

function computeKeyDistance(a, b) {
  const dx = (a.horizontal ?? 0) - (b.horizontal ?? 0);
  const dy = (a.vertical ?? 0) - (b.vertical ?? 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function computeClusterCenter(cluster) {
  const averageHorizontal =
    cluster.keys.reduce((sum, entry) => sum + entry.horizontal, 0) /
    Math.max(cluster.keys.length, 1);
  const averageVertical =
    cluster.keys.reduce((sum, entry) => sum + entry.vertical, 0) /
    Math.max(cluster.keys.length, 1);

  return { horizontal: averageHorizontal, vertical: averageVertical };
}

function computeClusterSpread(cluster) {
  const center = computeClusterCenter(cluster);
  return cluster.keys.reduce(
    (maxSpread, entry) => Math.max(maxSpread, computeKeyDistance(entry, center)),
    0,
  );
}

function summarizeCluster(cluster, fallbackVelocity) {
  const clusterVelocities = [];

  cluster.keys.forEach((entry, index) => {
    if (index > 0) {
      clusterVelocities.push(entry.timestamp - cluster.keys[index - 1].timestamp);
    }
  });

  const center = computeClusterCenter(cluster);

  return {
    ...cluster,
    size: cluster.keys.length,
    start: cluster.keys[0]?.relativeTimestamp ?? 0,
    end: cluster.keys[cluster.keys.length - 1]?.relativeTimestamp ?? 0,
    averageVelocity: clusterVelocities.length
      ? clusterVelocities.reduce((sum, value) => sum + value, 0) /
        clusterVelocities.length
      : fallbackVelocity,
    averageHorizontal: center.horizontal,
    averageVertical: center.vertical,
  };
}

function shouldStartNewCluster(entry, previous, currentCluster) {
  if (!currentCluster || !previous) return true;

  const gap = entry.timestamp - previous.timestamp;
  if (gap > CLUSTER_GAP_MS || currentCluster.keys.length >= MAX_CLUSTER_SIZE) {
    return true;
  }

  const clusterCenter = computeClusterCenter(currentCluster);
  const distToCenter = computeKeyDistance(entry, clusterCenter);
  const distFromPrev = computeKeyDistance(entry, previous);

  if (distToCenter > CLUSTER_SPATIAL_RADIUS && gap > CLUSTER_NEIGHBOR_GAP_MS) {
    return true;
  }

  if (distFromPrev > CLUSTER_NEIGHBOR_RADIUS && gap > CLUSTER_NEIGHBOR_GAP_MS * 0.6) {
    return true;
  }

  return false;
}

function splitBroadClusters(clusters) {
  const next = [];

  clusters.forEach((cluster) => {
    if (cluster.keys.length < 4) {
      next.push(cluster);
      return;
    }

    const spread = computeClusterSpread(cluster);
    if (spread <= CLUSTER_SPLIT_SPREAD) {
      next.push(cluster);
      return;
    }

    let bestIndex = -1;
    let bestJump = 0;

    for (let index = 1; index < cluster.keys.length; index += 1) {
      const jump = computeKeyDistance(cluster.keys[index - 1], cluster.keys[index]);
      if (jump > bestJump) {
        bestJump = jump;
        bestIndex = index;
      }
    }

    if (
      bestIndex <= 1 ||
      bestIndex >= cluster.keys.length - 1 ||
      bestJump <= CLUSTER_SPLIT_JUMP
    ) {
      next.push(cluster);
      return;
    }

    next.push({ keys: cluster.keys.slice(0, bestIndex) });
    next.push({ keys: cluster.keys.slice(bestIndex) });
  });

  return next;
}

function mergeTinyClusters(clusters) {
  if (clusters.length <= 1) return clusters;

  const next = clusters.map((cluster) => ({ keys: [...cluster.keys] }));

  for (let index = 0; index < next.length; index += 1) {
    const cluster = next[index];
    if (!cluster || cluster.keys.length > CLUSTER_TINY_SIZE) continue;

    const prev = next[index - 1];
    const following = next[index + 1];
    const center = computeClusterCenter(cluster);

    let mergeTarget = null;
    let mergeDirection = 0;
    let bestScore = Infinity;

    if (prev) {
      const prevGap = cluster.keys[0].timestamp - prev.keys[prev.keys.length - 1].timestamp;
      const prevDist = computeKeyDistance(center, computeClusterCenter(prev));
      if (prevGap <= CLUSTER_MERGE_GAP_MS && prevDist <= CLUSTER_MERGE_DISTANCE) {
        const score = prevGap + prevDist * 100;
        if (score < bestScore) {
          bestScore = score;
          mergeTarget = prev;
          mergeDirection = -1;
        }
      }
    }

    if (following) {
      const nextGap = following.keys[0].timestamp - cluster.keys[cluster.keys.length - 1].timestamp;
      const nextDist = computeKeyDistance(center, computeClusterCenter(following));
      if (nextGap <= CLUSTER_MERGE_GAP_MS && nextDist <= CLUSTER_MERGE_DISTANCE) {
        const score = nextGap + nextDist * 100;
        if (score < bestScore) {
          bestScore = score;
          mergeTarget = following;
          mergeDirection = 1;
        }
      }
    }

    if (!mergeTarget) continue;

    if (mergeDirection < 0) {
      mergeTarget.keys.push(...cluster.keys);
    } else {
      mergeTarget.keys.unshift(...cluster.keys);
    }

    next[index] = null;
  }

  return next.filter(Boolean);
}

export function analyzeInput(snapshot) {
  const keys = snapshot.keys.map((entry, index) => ({
    ...entry,
    relativeTimestamp: entry.timestamp - snapshot.keys[0]?.timestamp || 0,
    index,
  }));
  const velocities = snapshot.velocities;
  const averageVelocity = velocities.length
    ? velocities.reduce((sum, value) => sum + value, 0) / velocities.length
    : 0;
  const rhythmVariance = computeVariance(velocities, averageVelocity);

  const rawClusters = [];
  let currentCluster = null;

  keys.forEach((entry, index) => {
    const previous = keys[index - 1];
    if (shouldStartNewCluster(entry, previous, currentCluster)) {
      currentCluster = { keys: [] };
      rawClusters.push(currentCluster);
    }

    currentCluster.keys.push(entry);
  });

  const refinedClusters = mergeTinyClusters(splitBroadClusters(rawClusters))
    .map((cluster, index) => ({ ...cluster, index }));

  const clusterSummaries = refinedClusters.map((cluster) => summarizeCluster(cluster, averageVelocity));

  const leftRightBias = keys.length
    ? keys.reduce((sum, entry) => sum + entry.horizontal, 0) / keys.length
    : 0;
  const rowBias = keys.length
    ? keys.reduce((sum, entry) => sum + entry.vertical, 0) / keys.length
    : 0;

  return {
    ...snapshot,
    keys,
    clusters: clusterSummaries,
    averageVelocity,
    rhythmVariance,
    leftRightBias,
    rowBias,
  };
}
