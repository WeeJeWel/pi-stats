import fs from 'fs';
import http from 'http';
import { exec } from 'child_process';
import { EventEmitter } from 'events';

import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import osUtils from 'node-os-utils';

const PORT = process.env.PORT || 3000;

class Server {

  constructor() {
    this.app = express();
    this.app.use(express.static('public'));

    this.server = http.createServer(this.app);
    this.server.listen(PORT, () => {
      console.log(`Server listening on http://0.0.0.0:${PORT}`);
    });

    this.io = new SocketIOServer(this.server);
    this.io.on('connection', () => {
      this.networkMonitor.logNetworkStats();
      this.storageMonitor.logStorageStats();
      this.systemMonitor.logSystemStats();
    });

    this.networkMonitor = new NetworkMonitor('eth0', 1000 / 60); // 60fps
    this.networkMonitor.start();
    this.networkMonitor.on('stats', ({ rxSpeed, txSpeed }) => {
      // console.log(`RX Speed: ${rxSpeed.toFixed(2)} Mbps | TX Speed: ${txSpeed.toFixed(2)} Mbps`);
      this.io.emit('network', { rxSpeed, txSpeed });
    });

    this.storageMonitor = new StorageMonitor();
    this.storageMonitor.start();
    this.storageMonitor.on('stats', ({ disks }) => {
      this.io.emit('storage', { disks });
    });

    this.systemMonitor = new SystemMonitor();
    this.systemMonitor.start();
    this.systemMonitor.on('cpu', ({ percentage }) => {
      this.io.emit('cpu', { percentage });
    });
    this.systemMonitor.on('mem', ({ total, used, percentage }) => {
      this.io.emit('mem', { total, used, percentage });
    });
    this.systemMonitor.on('temperature', ({ temperature }) => {
      this.io.emit('temperature', { temperature });
    });
    this.systemMonitor.on('frequency', ({ frequency }) => {
      this.io.emit('frequency', { frequency });
    });
  }

}

class NetworkMonitor extends EventEmitter {
  constructor(interfaceName, intervalMs = 100) {
    super();
    this.interfaceName = interfaceName;
    this.intervalMs = intervalMs;
    this.previousStats = null;
    this.intervalId = null;
  }

  // Helper function to read network stats from /proc/net/dev
  readNetworkStats() {
    return new Promise((resolve, reject) => {
      fs.readFile('/proc/net/dev', 'utf8', (err, data) => {
        if (err) {
          reject(`Error reading /proc/net/dev: ${err}`);
          return;
        }

        const lines = data.trim().split('\n');
        const stats = {};

        // Parse each network interface
        lines.slice(2).forEach((line) => {
          const [interfaceName, statsData] = line.trim().split(/:(.+)/);
          const statsArray = statsData.trim().split(/\s+/);
          const rxBytes = parseInt(statsArray[0]);
          const txBytes = parseInt(statsArray[8]);

          stats[interfaceName.trim()] = { rxBytes, txBytes };
        });

        resolve(stats);
      });
    });
  }

  // Method to calculate and emit network speed events
  async logNetworkStats() {
    try {
      const currentStats = await this.readNetworkStats();
      const iface = this.interfaceName;

      if (this.previousStats && this.previousStats[iface] && currentStats[iface]) {
        const rxDiff = currentStats[iface].rxBytes - this.previousStats[iface].rxBytes;
        const txDiff = currentStats[iface].txBytes - this.previousStats[iface].txBytes;

        // Calculate speed in Mbps, accounting for the interval
        const rxSpeedMbps = (rxDiff * 8) / (1024 * 1024) * (1000 / this.intervalMs);
        const txSpeedMbps = (txDiff * 8) / (1024 * 1024) * (1000 / this.intervalMs);

        // Emit events with speed data
        this.emit('stats', {
          rxSpeed: rxSpeedMbps,
          txSpeed: txSpeedMbps,
        });
      }

      this.previousStats = currentStats;
    } catch (error) {
      console.error(error);
    }
  }

  // Method to start monitoring
  start() {
    if (!this.intervalId) {
      this.intervalId = setInterval(() => this.logNetworkStats(), this.intervalMs);
    }
  }

  // Method to stop monitoring
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

class StorageMonitor extends EventEmitter {

  constructor() {
    super();

    this.intervalId = null;
    this.intervalMs = 1000 * 60;
  }

  // Method to start monitoring
  start() {
    if (!this.intervalId) {
      this.intervalId = setInterval(() => this.logStorageStats(), this.intervalMs);
    }
  }

  // Method to stop monitoring
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  logStorageStats() {
    Promise.resolve().then(async () => {
      const disks = await new Promise((resolve, reject) => {
        exec('df -h', (err, stdout, stderr) => {
          if (err) {
            return reject(err);
          }
          const lines = stdout.trim().split('\n');
          const headers = lines[0].split(/\s+/);
          const disks = lines.slice(1).map(line => {
            const parts = line.split(/\s+/);
            return {
              filesystem: parts[0],
              size: parts[1],
              used: parts[2],
              available: parts[3],
              usePercent: parts[4],
              mountedOn: parts[5]
            };
          });
          resolve(disks);
        });
      });

      this.emit('stats', { disks });
    });
  }

}

class SystemMonitor extends EventEmitter {
  constructor() {
    super();
    this.intervalId = null;
    this.intervalMs = 1000;
  }

  start() {
    if (!this.intervalId) {
      this.intervalId = setInterval(() => this.logSystemStats(), this.intervalMs);
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  logSystemStats() {
    osUtils.cpu.usage(this.intervalMs).then(percentage => {
      this.emit('cpu', { percentage });
    });

    osUtils.mem.info().then(info => {
      this.emit('mem', {
        total: info.totalMemMb,
        used: info.usedMemMb,
        percentage: info.usedMemPercentage,
      });
    });

    exec('vcgencmd measure_temp', (err, stdout, stderr) => {
      if (err) {
        console.error(`Error getting CPU temperature: ${err}`);
        return;
      }

      const temperature = parseFloat(stdout.split('=')[1]); // in Celsius
      this.emit('temperature', { temperature });
    });

    exec('vcgencmd measure_clock arm', (err, stdout, stderr) => {
      if (err) {
        console.error(`Error getting CPU frequency: ${err}`);
        return;
      }

      const frequency = parseFloat(stdout.split('=')[1]); // in Hz
      this.emit('frequency', { frequency });
    });
  }
}

export default new Server();