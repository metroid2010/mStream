const os = require('os');
const winston = require('winston');
const path = require('path');
const { spawn } = require('child_process');

var spawnedTunnel;
const platform = os.platform();
const osMap = {
  "win32": "mstream-ddns-win.exe",
  "darwin": "syncthing-osx",
  "linux": "mstream-ddns-linux",
  "android": "mstream-rpn-android64"
};

exports.setup = function (program) {
  process.on('exit', (code) => {
    // kill all workers
    if(spawnedTunnel) {
      spawnedTunnel.stdin.pause();
      spawnedTunnel.kill();
    }
  });

  // if(!program.ddns || !program.ddns.email || !program.ddns.password) {
  //   return;
  // }

  bootReverseProxy(program);
}

function bootReverseProxy(program) {
  if(spawnedTunnel) {
    winston.warn('Sync: SyncThing already setup');
    return;
  }

  try {
    var syncConfigDirectory = '/Users/paulsori/Documents/mstream/save/sync';
    if (program.storage.syncConfigDirectory) {
      syncConfigDirectory = program.storage.syncConfigDirectory
    }

    console.log(syncConfigDirectory)

    spawnedTunnel = spawn(path.join(__dirname, `../../sync/${osMap[platform]}`), ['--home', syncConfigDirectory], {

    });

    spawnedTunnel.stdout.on('data', (data) => {
      console.log(`sync: ${data}`);
    });
    
    spawnedTunnel.stderr.on('data', (data) => {
      console.log(`sync err: ${data}`);
    });

    spawnedTunnel.on('close', (code) => {
      winston.info('Sync: SyncThing failed. Attempting to reboot');
      setTimeout(() => {
        winston.info('Sync: Rebooting SyncThing');
        delete spawnedTunnel;
        bootReverseProxy(program);
      }, 4000);
    });

    winston.info('Sync: SyncThing Booted');
  }catch (err) {
    winston.error(`Failed to boot SyncThing`);
    winston.error(err.message);
    return;
  }
}