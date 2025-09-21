const os = require('os');
const { exec } = require('child_process');

// Utilities to compute real-time system metrics
const cpuTimesSnapshot = () => {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    const times = cpu.times;
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }
  return { idle, total };
};

const getCpuUsagePercent = async (sampleMs = 200) => {
  const start = cpuTimesSnapshot();
  await new Promise(r => setTimeout(r, sampleMs));
  const end = cpuTimesSnapshot();
  const idleDiff = end.idle - start.idle;
  const totalDiff = end.total - start.total;
  const usage = totalDiff > 0 ? (1 - idleDiff / totalDiff) * 100 : 0;
  return Math.round(usage);
};

const getDiskUsagePercent = () => new Promise((resolve) => {
  try {
    if (process.platform === 'win32') {
      // Fixed drives only (DriveType=3)
      exec('wmic logicaldisk where DriveType=3 get Size,FreeSpace,DeviceID /format:csv', (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const lines = stdout.trim().split(/\r?\n/).slice(1); // skip header
        let total = 0;
        let free = 0;
        for (const line of lines) {
          const parts = line.split(',');
          // CSV format: Node,DeviceID,FreeSpace,Size
          if (parts.length >= 4) {
            const freeSpace = Number(parts[2]);
            const size = Number(parts[3]);
            if (!isNaN(size) && size > 0 && !isNaN(freeSpace)) {
              total += size;
              free += freeSpace;
            }
          }
        }
        if (total > 0) {
          const used = total - free;
          resolve(Math.round((used / total) * 100));
        } else {
          resolve(null);
        }
      });
    } else {
      // Use df for Unix-like systems
      exec('df -kP /', (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const lines = stdout.trim().split(/\r?\n/);
        if (lines.length < 2) return resolve(null);
        const cols = lines[1].split(/\s+/);
        // Expected: Filesystem 1024-blocks Used Available Capacity Mounted on
        const used = Number(cols[2]);
        const total = Number(cols[1]);
        if (!isNaN(used) && !isNaN(total) && total > 0) {
          resolve(Math.round((used / total) * 100));
        } else {
          resolve(null);
        }
      });
    }
  } catch (e) {
    resolve(null);
  }
});

// Real-time system metrics endpoint handler
const getSystemMetrics = async (req, res) => {
  try {
    const [cpuUsage, diskUsage] = await Promise.all([
      getCpuUsagePercent(200),
      getDiskUsagePercent(),
    ]);

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryUsagePercent = Math.round((usedMem / totalMem) * 100);

    res.json({
      serverTime: Date.now(),
      uptimeSec: Math.round(process.uptime()),
      cpu: {
        usagePercent: isNaN(cpuUsage) ? null : cpuUsage,
      },
      memory: {
        totalBytes: totalMem,
        usedBytes: usedMem,
        freeBytes: freeMem,
        usagePercent: memoryUsagePercent,
      },
      disk: diskUsage == null ? null : { usagePercent: diskUsage },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getSystemMetrics
};
