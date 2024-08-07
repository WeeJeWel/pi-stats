import fs from 'fs';
import http from 'http';
import { EventEmitter } from 'events';

import express from 'express';
import { Server as SocketIOServer } from 'socket.io';

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

    this.ethernetMonitor = new EthernetMonitor('eth0', 1000 / 60); // 60fps
    this.ethernetMonitor.start();
    this.ethernetMonitor.on('stats', ({ rxSpeed, txSpeed }) => {
      // console.log(`RX Speed: ${rxSpeed.toFixed(2)} Mbps | TX Speed: ${txSpeed.toFixed(2)} Mbps`);
      this.io.emit('stats', { rxSpeed, txSpeed });
    });
  }

}

class EthernetMonitor extends EventEmitter {
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
  async logNetworkSpeed() {
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
      this.intervalId = setInterval(() => this.logNetworkSpeed(), this.intervalMs);
      console.log(`Started monitoring ${this.interfaceName} every ${this.intervalMs}ms.`);
    }
  }

  // Method to stop monitoring
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log(`Stopped monitoring ${this.interfaceName}.`);
    }
  }
}

const server = new Server();