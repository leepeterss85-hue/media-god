// Qualification probes are independent. A foreground launch needs one fully
// accepted result; a slow sibling probe must not hold that result until timeout.
// Every probe keeps a rejection handler after settlement, and the caller gets
// a snapshot so late completions cannot change the selected launch candidates.
export function firstAcceptedQualificationBatch(probes, accepts) {
  if (!probes.length) return Promise.resolve([]);
  return new Promise(resolve => {
    const results = new Array(probes.length);
    let remaining = probes.length;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(results.slice());
    };
    probes.forEach((probe, index) => {
      Promise.resolve(probe).then(value => {
        results[index] = value;
        if (accepts(value)) finish();
      }).catch(() => {
        results[index] = null;
      }).finally(() => {
        remaining -= 1;
        if (remaining === 0) finish();
      });
    });
  });
}
