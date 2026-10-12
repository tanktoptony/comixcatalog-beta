function normalizeName(name) {
  return String(name).replace(/[^A-Za-z0-9_-]/g, "_");
}

export function createServerTiming(now = () => performance.now()) {
  const durations = new Map();
  const addDuration = (name, duration) => {
    const key = normalizeName(name);
    durations.set(key, (durations.get(key) ?? 0) + Math.max(0, duration));
  };

  const measure = async (name, work) => {
    const startedAt = now();
    try {
      return await work();
    } finally {
      addDuration(name, now() - startedAt);
    }
  };

  const measureSync = (name, work) => {
    const startedAt = now();
    try {
      return work();
    } finally {
      addDuration(name, now() - startedAt);
    }
  };

  return {
    measure,
    measureSync,
    start(name) {
      const startedAt = now();
      return () => addDuration(name, now() - startedAt);
    },
    set(name, duration = 0) {
      durations.set(normalizeName(name), Math.max(0, Number(duration) || 0));
    },
    header() {
      return [...durations]
        .map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`)
        .join(", ");
    },
  };
}
